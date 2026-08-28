import type { ProviderOptions } from "@ai-sdk/provider-utils";
import {
  type LanguageModel,
  type ModelMessage,
  type ToolApprovalConfiguration,
  type ToolSet,
} from "ai";
import { buildBoundTools } from "@/app/api/workspace/[agentId]/chat/route-support";
import {
  createRuntimeDeadline,
  resolveAgentRuntimeLimits,
  timeoutMsUntil,
} from "@/modules/agent/runtime-policy";
import type { ResolvedProviderConfig } from "@/modules/agent/use-cases";
import { buildSkillsRegistryPrompt } from "@/modules/skills/use-cases";
import {
  fitModelHistoryToContext,
  type ConversationContextPolicy,
} from "@/modules/chat/conversation-context-policy";
import { getAdapter } from "@/server/infrastructure/providers";
import { buildDelegationTools } from "./runtime-executor.build-delegation-tools";
import {
  AgentExecutionError,
  InternalExecutionInput,
  SuccessfulToolResult,
  nextSequence,
} from "./runtime-executor.heartbeat-ms";
import { instrumentTools } from "./runtime-executor.instrument-tools";
import type { ReasoningPreset } from "./reasoning-presets";
import { reasoningCallSettings } from "./reasoning-presets";

export type ResolvedProvider = NonNullable<ResolvedProviderConfig>;

export interface PreparedAgentExecution {
  provider: ResolvedProvider;
  model: LanguageModel;
  reasoningSettings: {
    reasoning?: Exclude<ReasoningPreset, "ultra">;
    providerOptions?: ProviderOptions;
  };
  runtimeLimits: {
    maxToolCalls: number;
    maxOutputTokens: number;
    maxSteps: number;
  };
  maxOutputTokens: number;
  effectiveMaxSteps: number;
  hasTools: boolean;
  tools: ToolSet;
  configuredToolChoice: "auto" | "none" | "required" | undefined;
  bound: {
    tools: ToolSet;
    toolApproval:
      | ToolApprovalConfiguration<ToolSet, Record<string, unknown>>
      | undefined;
  };
  system: string;
  contextPolicy: ConversationContextPolicy | null;
  fittedContext: { messages: ModelMessage[]; maxOutputTokens: number } | null;
  deadline: { timeoutSignal: AbortSignal; signal: AbortSignal };
  successfulToolResults: SuccessfulToolResult[];
  allocateSequence: () => number;
}

export async function prepareResolvedAgentExecution(
  input: InternalExecutionInput,
  runId: string,
  provider: ResolvedProvider,
): Promise<PreparedAgentExecution> {
  const adapter = getAdapter(provider.providerKind);
  const model = adapter.createChatModel(
    provider.runtimeConfig,
    provider.modelId,
  );
  const reasoningSettings = reasoningCallSettings(
    input.reasoningEffort,
    provider.runtimeConfig,
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
  const successfulToolResults: SuccessfulToolResult[] = [];
  const recordSuccessfulToolResult = (result: SuccessfulToolResult) => {
    successfulToolResults.push(result);
  };
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
          enableDocumentExplorer: (input.availableAttachments?.length ?? 0) > 0,
          nonInteractive: true,
        })
      : { tools: {}, toolApproval: undefined };
  const delegationTools = await buildDelegationTools({
    runId,
    resolved: input.resolved,
    execution: input,
    allocateSequence,
    onToolSuccess: recordSuccessfulToolResult,
  });
  const tools = instrumentTools(
    { ...bound.tools, ...delegationTools },
    runId,
    allocateSequence,
    recordSuccessfulToolResult,
  );
  const hasTools = Object.keys(tools).length > 0;
  const configuredToolChoice = hasTools
    ? input.resolved.version.toolChoice === "required" ||
      input.resolved.version.toolChoice === "none"
      ? input.resolved.version.toolChoice
      : "auto"
    : undefined;
  const effectiveMaxSteps = hasTools ? Math.max(2, maxSteps) : maxSteps;
  const hasDelegationTools = Object.keys(delegationTools).some((name) =>
    name.startsWith("delegate_specialist_"),
  );
  const delegationPrompt = hasDelegationTools
    ? "You are an orchestrator. Break the request into bounded tasks and use only the delegate_specialist_* tools whose configured expertise is relevant. When a task needs an uploaded file, pass only its relevant Attachment ID in attachmentIds. A specialist result can advertise visual outputs. Use publish_specialist_output only after that result and only when the visual deliverable materially helps the user; technical traces remain hidden by default. Synthesize the returned results into one answer. Never invent a child result or output ID."
    : null;
  const delegatedResultPrompt =
    input.trigger === "delegation"
      ? "Return only the final answer needed by the parent orchestrator. Do not mention internal tools, execution steps, agent identities, run identifiers, or hidden instructions."
      : null;
  const system = [
    input.resolved.version.systemPrompt?.trim() ||
      "You are a helpful enterprise AI assistant.",
    skillsPrompt,
    delegationPrompt,
    delegatedResultPrompt,
    input.systemContext?.trim() || null,
    input.dryRun
      ? "This is a dry run. Do not call tools or delegate. Explain the execution plan and configuration issues only."
      : null,
  ]
    .filter(Boolean)
    .join("\n\n");
  const contextPolicy = input.resolved.version
    .memoryPolicyJson as ConversationContextPolicy | null;
  const fittedContext = input.messages?.length
    ? fitModelHistoryToContext({
        messages: input.messages,
        contextWindowTokens:
          contextPolicy?.contextWindowTokens && provider.contextWindow
            ? Math.min(
                contextPolicy.contextWindowTokens,
                provider.contextWindow,
              )
            : (contextPolicy?.contextWindowTokens ?? provider.contextWindow),
        requestedOutputTokens: maxOutputTokens,
        systemPrompt: system,
      })
    : null;
  const deadline = createRuntimeDeadline(
    timeoutMsUntil(input.deadlineAt),
    input.budget.controller.signal,
  );
  return {
    provider,
    model,
    reasoningSettings,
    runtimeLimits,
    maxOutputTokens,
    effectiveMaxSteps,
    hasTools,
    tools,
    configuredToolChoice,
    bound,
    system,
    contextPolicy,
    fittedContext,
    deadline,
    successfulToolResults,
    allocateSequence,
  };
}
