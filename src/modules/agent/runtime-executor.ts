import {
  generateText,
  stepCountIs,
  tool,
  type ModelMessage,
  type ToolSet,
} from "ai";
import { z } from "zod";
import { buildBoundTools } from "@/app/api/workspace/[agentId]/chat/route-support";
import { getDelegationBindingsForVersion } from "@/modules/agent/delegation-use-cases";
import {
  normalizeOrchestrationPolicy,
  orchestrationPolicyDefaults,
  type OrchestrationPolicy,
} from "@/modules/agent/orchestration-policy";
import {
  agentRuntimePolicy,
  createRuntimeDeadline,
  resolveAgentRuntimeLimits,
} from "@/modules/agent/runtime-policy";
import {
  appendAgentRunStep,
  claimAgentRun,
  completeAgentRun,
  consumeAgentRunDelegationBudget,
  createAgentRun,
  failAgentRun,
  heartbeatAgentRun,
  readAgentRunPayload,
  type AgentRunTrigger,
} from "@/modules/agent/run-use-cases";
import {
  getActiveVersion,
  getAgentVersionById,
  getVisibleAgentById,
  resolveProviderForVersion,
  type AgentRow,
  type AgentVersionRow,
} from "@/modules/agent/use-cases";
import { buildSkillsRegistryPrompt } from "@/modules/skills/use-cases";
import { authorization } from "@/server/domain/services/authorization";
import { db } from "@/server/infrastructure/db";
import { getAdapter } from "@/server/infrastructure/providers";

const HEARTBEAT_MS = 10_000;
const activeRunControllers = new Map<string, AbortController>();

export class AgentExecutionError extends Error {
  readonly code: string;

  constructor(
    message: string,
    code: string,
    readonly runId?: string,
  ) {
    super(message);
    this.name = "AgentExecutionError";
    this.code = code;
  }
}

export class AgentRunStateError extends AgentExecutionError {
  constructor(
    runId: string,
    readonly status: string,
  ) {
    super(`Agent run is ${status}`, "AGENT_RUN_NOT_EXECUTABLE", runId);
    this.name = "AgentRunStateError";
  }
}

type ExecutionBudget = {
  policy: OrchestrationPolicy;
  rootRunId: string;
  deadlineAt: Date;
  controller: AbortController;
  tokensUsed: number;
  activeDelegations: number;
};

type ResolvedAgent = { agent: AgentRow; version: AgentVersionRow };

type InternalExecutionInput = {
  resolved: ResolvedAgent;
  workspaceId: string;
  userId: string;
  prompt: string;
  messages?: ModelMessage[];
  systemContext?: string;
  trigger: AgentRunTrigger;
  budget: ExecutionBudget;
  depth: number;
  ancestry: string[];
  parentRunId?: string;
  existingRunId?: string;
  conversationId?: string | null;
  messageId?: string | null;
  scheduledTaskId?: string | null;
  idempotencyKey?: string | null;
  dryRun?: boolean;
};

export type ExecuteAgentInput = {
  workspaceId: string;
  userId: string;
  agentId: string;
  agentVersionId?: string;
  prompt: string;
  messages?: ModelMessage[];
  systemContext?: string;
  trigger: Exclude<AgentRunTrigger, "delegation">;
  conversationId?: string | null;
  messageId?: string | null;
  scheduledTaskId?: string | null;
  idempotencyKey?: string | null;
  abortSignal?: AbortSignal;
};

export type AgentExecutionResult = {
  runId: string;
  text: string;
  inputTokens: number;
  outputTokens: number;
  totalTreeTokens: number;
  reused: boolean;
};

function executionPolicy(resolved: ResolvedAgent) {
  if (resolved.agent.kind === "orchestrator") {
    return normalizeOrchestrationPolicy(
      resolved.version.orchestrationPolicyJson,
    );
  }
  const limits = resolveAgentRuntimeLimits({
    maxOutputTokens: resolved.version.maxOutputTokens,
    maxToolCalls: resolved.version.maxToolCalls,
  });
  return {
    ...orchestrationPolicyDefaults,
    maxDepth: 1,
    maxDelegations: 1,
    maxParallel: 1,
    maxChildSteps: 1,
    maxTotalTokens: Math.min(100_000, Math.max(1_000, limits.maxOutputTokens)),
    timeoutMs: Math.min(
      orchestrationPolicyDefaults.timeoutMs,
      agentRuntimePolicy.chatTimeoutMs,
    ),
  } satisfies OrchestrationPolicy;
}

async function resolveAgent(input: {
  agentId: string;
  agentVersionId?: string;
  workspaceId: string;
  userId: string;
}): Promise<ResolvedAgent> {
  const agent = await getVisibleAgentById(
    input.agentId,
    input.workspaceId,
    input.userId,
    false,
  );
  if (!agent) {
    throw new AgentExecutionError("Agent not found", "AGENT_NOT_FOUND");
  }
  const version = input.agentVersionId
    ? await getAgentVersionById(input.agentVersionId)
    : await getActiveVersion(input.agentId);
  if (!version || version.agentId !== agent.id) {
    throw new AgentExecutionError(
      "Agent version not found",
      "AGENT_VERSION_NOT_FOUND",
    );
  }
  return { agent, version };
}

function nextSequence() {
  let sequence = 0;
  return () => {
    sequence += 1;
    return sequence;
  };
}

function instrumentTools(
  tools: ToolSet,
  runId: string,
  allocateSequence: () => number,
) {
  const instrumented: ToolSet = {};
  for (const [name, definition] of Object.entries(tools)) {
    const executable = definition as typeof definition & {
      execute?: (...args: unknown[]) => Promise<unknown> | unknown;
    };
    if (!executable.execute || name.startsWith("delegate_")) {
      instrumented[name] = definition;
      continue;
    }
    const execute = executable.execute.bind(executable);
    instrumented[name] = {
      ...definition,
      execute: async (...args: unknown[]) => {
        const sequence = allocateSequence();
        try {
          const output = await execute(...args);
          await appendAgentRunStep({
            runId,
            sequence,
            kind: "tool",
            status: "success",
            name,
            inputPreview: args[0],
            outputPreview: output,
            completedAt: new Date(),
          });
          return output;
        } catch (error) {
          await appendAgentRunStep({
            runId,
            sequence,
            kind: "tool",
            status: "failed",
            name,
            inputPreview: args[0],
            errorMessage:
              error instanceof Error ? error.message : String(error),
            completedAt: new Date(),
          });
          throw error;
        }
      },
    } as (typeof instrumented)[string];
  }
  return instrumented;
}

function truncateDelegationResult(value: string, maxChars: number) {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}\n\n[Delegated result truncated]`;
}

async function buildDelegationTools(input: {
  runId: string;
  resolved: ResolvedAgent;
  execution: InternalExecutionInput;
  allocateSequence: () => number;
}) {
  if (input.resolved.agent.kind !== "orchestrator" || input.execution.dryRun) {
    return {} satisfies ToolSet;
  }
  const bindings = await getDelegationBindingsForVersion(
    input.resolved.version.id,
    db,
  );
  const delegationTools: ToolSet = {};

  for (const binding of bindings) {
    const toolName = `delegate_${binding.childAgentId.replaceAll("-", "")}`;
    delegationTools[toolName] = tool({
      description: [
        `Delegate one bounded task to agent ${binding.childAgentId}.`,
        binding.instructions?.trim(),
        "Return the child result to the orchestrator and continue the parent plan.",
      ]
        .filter(Boolean)
        .join(" "),
      inputSchema: z.object({
        task: z.string().trim().min(1).max(32_000),
      }),
      execute: async ({ task }) => {
        const sequence = input.allocateSequence();
        let childRunId: string | undefined;
        let activeSlotReserved = false;
        try {
          const permission = await authorization.checkPermission(
            { principalType: "user", principalId: input.execution.userId },
            "agents.delegate",
            "workspace",
            input.execution.workspaceId,
          );
          if (!permission.granted) {
            throw new AgentExecutionError(
              permission.reason ?? "Delegation is not allowed",
              "AGENT_DELEGATION_FORBIDDEN",
            );
          }
          if (
            input.execution.depth + 1 >
            input.execution.budget.policy.maxDepth
          ) {
            throw new AgentExecutionError(
              "Delegation depth limit reached",
              "AGENT_DELEGATION_DEPTH_EXCEEDED",
            );
          }
          if (input.execution.ancestry.includes(binding.childAgentId)) {
            throw new AgentExecutionError(
              "Delegation cycle blocked at runtime",
              "AGENT_DELEGATION_CYCLE",
            );
          }
          if (
            input.execution.budget.activeDelegations >=
            input.execution.budget.policy.maxParallel
          ) {
            throw new AgentExecutionError(
              "Parallel delegation limit reached",
              "AGENT_DELEGATION_PARALLEL_LIMIT",
            );
          }

          input.execution.budget.activeDelegations += 1;
          activeSlotReserved = true;
          const delegationNumber = await consumeAgentRunDelegationBudget({
            rootRunId: input.execution.budget.rootRunId,
            maxDelegations: input.execution.budget.policy.maxDelegations,
          });
          if (delegationNumber === null) {
            throw new AgentExecutionError(
              "Delegation call limit reached",
              "AGENT_DELEGATION_LIMIT",
            );
          }

          const child = await resolveAgent({
            agentId: binding.childAgentId,
            agentVersionId: binding.childAgentVersionId,
            workspaceId: input.execution.workspaceId,
            userId: input.execution.userId,
          });
          const result = await executeResolvedAgent({
            resolved: child,
            workspaceId: input.execution.workspaceId,
            userId: input.execution.userId,
            prompt: task,
            trigger: "delegation",
            budget: input.execution.budget,
            depth: input.execution.depth + 1,
            ancestry: [...input.execution.ancestry, binding.childAgentId],
            parentRunId: input.runId,
            conversationId: input.execution.conversationId,
            messageId: input.execution.messageId,
          });
          childRunId = result.runId;
          const output = truncateDelegationResult(
            result.text,
            input.execution.budget.policy.resultMaxChars,
          );
          await appendAgentRunStep({
            runId: input.runId,
            sequence,
            kind: "delegation",
            status: "success",
            name: toolName,
            childRunId,
            inputPreview: { task },
            outputPreview: { text: output },
            completedAt: new Date(),
          });
          return { childRunId, result: output };
        } catch (error) {
          if (error instanceof AgentExecutionError && error.runId) {
            childRunId = error.runId;
          }
          await appendAgentRunStep({
            runId: input.runId,
            sequence,
            kind: "delegation",
            status: "failed",
            name: toolName,
            childRunId,
            inputPreview: { task },
            errorMessage:
              error instanceof Error ? error.message : String(error),
            completedAt: new Date(),
          });
          throw error;
        } finally {
          if (activeSlotReserved) {
            input.execution.budget.activeDelegations = Math.max(
              0,
              input.execution.budget.activeDelegations - 1,
            );
          }
        }
      },
    });
  }
  return delegationTools;
}

async function executeResolvedAgent(
  input: InternalExecutionInput,
): Promise<AgentExecutionResult> {
  const created = input.existingRunId
    ? { run: { id: input.existingRunId }, reused: false as const }
    : await createAgentRun({
        workspaceId: input.workspaceId,
        agentId: input.resolved.agent.id,
        agentVersionId: input.resolved.version.id,
        actorPrincipalType: "user",
        actorPrincipalId: input.userId,
        trigger: input.trigger,
        payload: { prompt: input.prompt },
        requestedTokens: input.budget.policy.maxTotalTokens,
        deadlineAt: input.budget.deadlineAt,
        rootRunId: input.budget.rootRunId,
        parentRunId: input.parentRunId,
        conversationId: input.conversationId,
        messageId: input.messageId,
        scheduledTaskId: input.scheduledTaskId,
        idempotencyKey: input.idempotencyKey,
        depth: input.depth,
      });
  const runId = created.run.id;
  activeRunControllers.set(runId, input.budget.controller);
  const leaseOwner = `${process.pid}:${crypto.randomUUID()}`;
  const claimed = await claimAgentRun({ runId, leaseOwner });
  if (!claimed) {
    activeRunControllers.delete(runId);
    throw new AgentRunStateError(runId, "not claimable");
  }

  const heartbeat = setInterval(() => {
    void heartbeatAgentRun({ runId, leaseOwner }).then((alive) => {
      if (!alive) input.budget.controller.abort("Agent run lease was lost");
    });
  }, HEARTBEAT_MS);
  heartbeat.unref?.();

  let inputTokens = 0;
  let outputTokens = 0;
  let usageProvider:
    | Awaited<ReturnType<typeof resolveProviderForVersion>>
    | undefined;
  const startedAt = Date.now();
  try {
    const provider = await resolveProviderForVersion(input.resolved.version);
    usageProvider = provider;
    if (!provider?.modelId) {
      throw new AgentExecutionError(
        "Agent model is not configured",
        "AGENT_MODEL_NOT_CONFIGURED",
        runId,
      );
    }
    const adapter = getAdapter(provider.providerKind);
    const model = adapter.createChatModel(
      provider.runtimeConfig,
      provider.modelId,
    );
    const runtimeLimits = resolveAgentRuntimeLimits({
      maxToolCalls: input.resolved.version.maxToolCalls,
      maxOutputTokens: input.resolved.version.maxOutputTokens,
    });
    const remainingTokens =
      input.budget.policy.maxTotalTokens - input.budget.tokensUsed;
    if (remainingTokens <= 0) {
      throw new AgentExecutionError(
        "Agent tree token budget exhausted",
        "AGENT_TOKEN_BUDGET_EXCEEDED",
        runId,
      );
    }
    const maxOutputTokens = Math.max(
      1,
      Math.min(runtimeLimits.maxOutputTokens, remainingTokens),
    );
    const maxSteps =
      input.depth > 0
        ? Math.min(runtimeLimits.maxSteps, input.budget.policy.maxChildSteps)
        : runtimeLimits.maxSteps;
    const allocateSequence = nextSequence();
    const skillsPrompt = input.dryRun
      ? null
      : await buildSkillsRegistryPrompt(input.resolved.version.id);
    const bound =
      !input.dryRun && runtimeLimits.maxToolCalls > 0
        ? await buildBoundTools({
            agentVersionId: input.resolved.version.id,
            workspaceId: input.workspaceId,
            conversationId: input.conversationId ?? undefined,
            messageId: input.messageId ?? undefined,
            userId: input.userId,
            maxToolCalls: runtimeLimits.maxToolCalls,
            approvalPolicy:
              (input.resolved.version.approvalPolicyJson as never) ?? null,
            hasSkills: Boolean(skillsPrompt),
            nonInteractive: true,
          })
        : { tools: {}, toolApproval: undefined };
    const delegationTools = await buildDelegationTools({
      runId,
      resolved: input.resolved,
      execution: input,
      allocateSequence,
    });
    const tools = instrumentTools(
      { ...bound.tools, ...delegationTools },
      runId,
      allocateSequence,
    );
    const delegationPrompt =
      Object.keys(delegationTools).length > 0
        ? "You are an orchestrator. Break the request into bounded tasks and use only the delegate_* tools whose child expertise is relevant. Synthesize the returned results into one answer. Never invent a child result."
        : null;
    const system = [
      input.resolved.version.systemPrompt?.trim() ||
        "You are a helpful enterprise AI assistant.",
      skillsPrompt,
      delegationPrompt,
      input.systemContext?.trim() || null,
      input.dryRun
        ? "This is a dry run. Do not call tools or delegate. Explain the execution plan and configuration issues only."
        : null,
    ]
      .filter(Boolean)
      .join("\n\n");
    const deadline = createRuntimeDeadline(
      Math.max(1, input.budget.deadlineAt.getTime() - Date.now()),
      input.budget.controller.signal,
    );
    const result = await generateText({
      model,
      system,
      ...(input.messages?.length
        ? { messages: input.messages }
        : { prompt: input.prompt }),
      temperature: input.resolved.version.temperature
        ? Number.parseFloat(input.resolved.version.temperature)
        : undefined,
      topP: input.resolved.version.topP
        ? Number.parseFloat(input.resolved.version.topP)
        : undefined,
      maxOutputTokens,
      tools,
      toolChoice: Object.keys(tools).length > 0 ? "auto" : undefined,
      toolApproval: bound.toolApproval,
      stopWhen: stepCountIs(Math.max(1, maxSteps)),
      abortSignal: deadline.signal,
      telemetry: {
        functionId: "ai-hub.agent-run",
        recordInputs: false,
        recordOutputs: false,
      },
    });
    inputTokens = result.usage.inputTokens ?? 0;
    outputTokens = result.usage.outputTokens ?? 0;
    input.budget.tokensUsed += inputTokens + outputTokens;
    if (input.budget.tokensUsed > input.budget.policy.maxTotalTokens) {
      throw new AgentExecutionError(
        "Agent tree token budget exceeded",
        "AGENT_TOKEN_BUDGET_EXCEEDED",
        runId,
      );
    }
    const text = result.text.trim();
    await appendAgentRunStep({
      runId,
      sequence: allocateSequence(),
      kind: "model",
      status: "success",
      name: provider.modelId,
      inputPreview: { prompt: input.prompt },
      outputPreview: { text, inputTokens, outputTokens },
      completedAt: new Date(),
    });
    await completeAgentRun({
      runId,
      output: { text },
      inputTokens,
      outputTokens,
      reservationTokens:
        input.depth === 0 ? input.budget.tokensUsed : undefined,
      usage: {
        workspaceId: input.workspaceId,
        userId: input.userId,
        providerId: provider.providerId,
        modelId: provider.modelRecordId,
        agentId: input.resolved.agent.id,
        conversationId: input.conversationId ?? undefined,
        operation:
          input.trigger === "delegation" ? "delegation" : input.trigger,
        latencyMs: Date.now() - startedAt,
      },
    });
    return {
      runId,
      text,
      inputTokens,
      outputTokens,
      totalTreeTokens: input.budget.tokensUsed,
      reused: false,
    };
  } catch (error) {
    const aborted = input.budget.controller.signal.aborted;
    await failAgentRun({
      runId,
      status: aborted ? "cancelled" : "failed",
      error,
      errorCode:
        error instanceof AgentExecutionError
          ? error.code
          : aborted
            ? "AGENT_RUN_CANCELLED"
            : "AGENT_RUN_FAILED",
      inputTokens,
      outputTokens,
      reservationTokens:
        input.depth === 0 ? input.budget.tokensUsed : undefined,
      usage: {
        workspaceId: input.workspaceId,
        userId: input.userId,
        providerId: usageProvider?.providerId,
        modelId: usageProvider?.modelRecordId,
        agentId: input.resolved.agent.id,
        conversationId: input.conversationId ?? undefined,
        operation:
          input.trigger === "delegation" ? "delegation" : input.trigger,
        latencyMs: Date.now() - startedAt,
      },
    });
    throw error instanceof AgentExecutionError
      ? new AgentExecutionError(error.message, error.code, runId)
      : new AgentExecutionError(
          aborted ? "Agent run was cancelled" : "Agent run failed",
          aborted ? "AGENT_RUN_CANCELLED" : "AGENT_RUN_FAILED",
          runId,
        );
  } finally {
    clearInterval(heartbeat);
    activeRunControllers.delete(runId);
  }
}

export async function executeAgent(
  input: ExecuteAgentInput,
): Promise<AgentExecutionResult> {
  const permission = await authorization.checkPermission(
    { principalType: "user", principalId: input.userId },
    "agents.chat",
    "workspace",
    input.workspaceId,
  );
  if (!permission.granted) {
    throw new AgentExecutionError(
      permission.reason ?? "Agent execution is not allowed",
      "AGENT_RUN_FORBIDDEN",
    );
  }
  const resolved = await resolveAgent(input);
  const policy = executionPolicy(resolved);
  const deadlineAt = new Date(Date.now() + policy.timeoutMs);
  const created = await createAgentRun({
    workspaceId: input.workspaceId,
    agentId: resolved.agent.id,
    agentVersionId: resolved.version.id,
    actorPrincipalType: "user",
    actorPrincipalId: input.userId,
    trigger: input.trigger,
    payload: { prompt: input.prompt },
    requestedTokens: policy.maxTotalTokens,
    deadlineAt,
    conversationId: input.conversationId,
    messageId: input.messageId,
    scheduledTaskId: input.scheduledTaskId,
    idempotencyKey: input.idempotencyKey,
  });
  if (created.reused) {
    if (created.run.status === "success") {
      const payload = await readAgentRunPayload(created.run.id);
      const text =
        payload?.output &&
        typeof payload.output === "object" &&
        "text" in payload.output
          ? String(payload.output.text)
          : "";
      return {
        runId: created.run.id,
        text,
        inputTokens: created.run.inputTokens ?? 0,
        outputTokens: created.run.outputTokens ?? 0,
        totalTreeTokens:
          (created.run.inputTokens ?? 0) + (created.run.outputTokens ?? 0),
        reused: true,
      };
    }
    throw new AgentRunStateError(created.run.id, created.run.status);
  }

  const controller = new AbortController();
  if (input.abortSignal) {
    if (input.abortSignal.aborted) {
      controller.abort(input.abortSignal.reason);
    } else {
      input.abortSignal.addEventListener(
        "abort",
        () => controller.abort(input.abortSignal?.reason),
        { once: true },
      );
    }
  }
  return executeResolvedAgent({
    resolved,
    workspaceId: input.workspaceId,
    userId: input.userId,
    prompt: input.prompt,
    messages: input.messages,
    systemContext: input.systemContext,
    trigger: input.trigger,
    budget: {
      policy,
      rootRunId: created.run.id,
      deadlineAt,
      controller,
      tokensUsed: 0,
      activeDelegations: 0,
    },
    depth: 0,
    ancestry: [resolved.agent.id],
    existingRunId: created.run.id,
    conversationId: input.conversationId,
    messageId: input.messageId,
    scheduledTaskId: input.scheduledTaskId,
    idempotencyKey: input.idempotencyKey,
    dryRun: input.trigger === "dry_run",
  });
}

export function abortActiveAgentRun(runId: string) {
  const controller = activeRunControllers.get(runId);
  if (!controller) return false;
  controller.abort("Agent run cancelled");
  return true;
}
