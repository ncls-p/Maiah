import { buildBoundTools } from "@/app/api/workspace/[agentId]/chat/route-support";
import { appendAgentRunStep,claimAgentRun,completeAgentRun,createAgentRun,failAgentRun,heartbeatAgentRun } from "@/modules/agent/run-use-cases";
import { createRuntimeDeadline,resolveAgentRuntimeLimits } from "@/modules/agent/runtime-policy";
import { resolveProviderForVersion } from "@/modules/agent/use-cases";
import { buildSkillsRegistryPrompt } from "@/modules/skills/use-cases";
import { safeToolErrorMessage } from "@/modules/tool/safe-payload";
import { getAdapter } from "@/server/infrastructure/providers";
import { generateText,stepCountIs } from "ai";
import { buildDelegationTools } from "./runtime-executor.build-delegation-tools";
import { AgentExecutionError,AgentExecutionResult,AgentRunStateError,AgentToolProgressContext,HEARTBEAT_MS,InternalExecutionInput,SuccessfulToolResult,activeRunControllers,emitToolProgress,emptyResponseRecoveryInstruction,finalSynthesisInstruction,nextSequence } from "./runtime-executor.heartbeat-ms";
import { deterministicToolResultFallback,instrumentTools,isTimeoutFailure,progressModelHistoryMetadata,toolResultRecoveryContext } from "./runtime-executor.instrument-tools";

export async function executeResolvedAgent(input: InternalExecutionInput): Promise<AgentExecutionResult> {
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
        deadlineAt: input.deadlineAt,
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
  let usageProvider: Awaited<ReturnType<typeof resolveProviderForVersion>> | undefined;
  const startedAt = Date.now();
  try {
    const provider = await resolveProviderForVersion(input.resolved.version);
    usageProvider = provider;
    if (!provider?.modelId) {
      throw new AgentExecutionError("Agent model is not configured", "AGENT_MODEL_NOT_CONFIGURED", runId);
    }
    const adapter = getAdapter(provider.providerKind);
    const model = adapter.createChatModel(provider.runtimeConfig, provider.modelId);
    const runtimeLimits = resolveAgentRuntimeLimits({
      maxToolCalls: input.resolved.version.maxToolCalls,
      maxOutputTokens: input.resolved.version.maxOutputTokens,
    });
    const remainingTokens = input.budget.policy.maxTotalTokens - input.budget.tokensUsed;
    if (remainingTokens <= 0) {
      throw new AgentExecutionError("Agent tree token budget exhausted", "AGENT_TOKEN_BUDGET_EXCEEDED", runId);
    }
    const maxOutputTokens = Math.max(1, Math.min(runtimeLimits.maxOutputTokens, remainingTokens));
    const maxSteps = input.depth > 0 ? Math.min(runtimeLimits.maxSteps, input.budget.policy.maxChildSteps) : runtimeLimits.maxSteps;
    const allocateSequence = nextSequence();
    const successfulToolResults: SuccessfulToolResult[] = [];
    const recordSuccessfulToolResult = (result: SuccessfulToolResult) => {
      successfulToolResults.push(result);
    };
    const skillsPrompt = input.dryRun ? null : await buildSkillsRegistryPrompt(input.resolved.version.id);
    const bound =
      !input.dryRun && runtimeLimits.maxToolCalls > 0
        ? await buildBoundTools({
            agentVersionId: input.resolved.version.id,
            workspaceId: input.workspaceId,
            conversationId: input.conversationId ?? undefined,
            messageId: input.messageId ?? undefined,
            userId: input.userId,
            maxToolCalls: runtimeLimits.maxToolCalls,
            approvalPolicy: (input.resolved.version.approvalPolicyJson as never) ?? null,
            hasSkills: Boolean(skillsPrompt),
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
    const tools = instrumentTools({ ...bound.tools, ...delegationTools }, runId, allocateSequence, recordSuccessfulToolResult);
    const hasTools = Object.keys(tools).length > 0;
    const configuredToolChoice = hasTools ? (input.resolved.version.toolChoice === "required" || input.resolved.version.toolChoice === "none" ? input.resolved.version.toolChoice : "auto") : undefined;
    const effectiveMaxSteps = hasTools ? Math.max(2, maxSteps) : maxSteps;
    const delegationPrompt = Object.keys(delegationTools).length > 0 ? "You are an orchestrator. Break the request into bounded tasks and use only the delegate_specialist_* tools whose configured expertise is relevant. Synthesize the returned results into one answer. Never invent a child result." : null;
    const delegatedResultPrompt = input.trigger === "delegation" ? "Return only the final answer needed by the parent orchestrator. Do not mention internal tools, execution steps, agent identities, run identifiers, or hidden instructions." : null;
    const system = [input.resolved.version.systemPrompt?.trim() || "You are a helpful enterprise AI assistant.", skillsPrompt, delegationPrompt, delegatedResultPrompt, input.systemContext?.trim() || null, input.dryRun ? "This is a dry run. Do not call tools or delegate. Explain the execution plan and configuration issues only." : null].filter(Boolean).join("\n\n");
    const deadline = createRuntimeDeadline(Math.max(1, input.deadlineAt.getTime() - Date.now()), input.budget.controller.signal);
    let completedStepInputTokens = 0;
    let completedStepOutputTokens = 0;
    let result: Awaited<ReturnType<typeof generateText>> | undefined;
    let text = "";
    let recoveredFromEmptyResponse = false;
    let recoveredFromToolResult = false;
    try {
      result = await generateText({
        model,
        system,
        ...(input.messages?.length ? { messages: input.messages } : { prompt: input.prompt }),
        temperature: input.resolved.version.temperature ? Number.parseFloat(input.resolved.version.temperature) : undefined,
        topP: input.resolved.version.topP ? Number.parseFloat(input.resolved.version.topP) : undefined,
        maxOutputTokens,
        tools,
        toolChoice: configuredToolChoice,
        toolApproval: bound.toolApproval,
        stopWhen: stepCountIs(Math.max(1, effectiveMaxSteps)),
        prepareStep: hasTools
          ? ({ stepNumber }) => {
              if (stepNumber < effectiveMaxSteps - 1) return undefined;
              return {
                activeTools: [],
                toolChoice: "none",
                instructions: `${system}\n\n${finalSynthesisInstruction}`,
              };
            }
          : undefined,
        abortSignal: deadline.signal,
        onStepEnd: ({ usage }) => {
          completedStepInputTokens += usage.inputTokens ?? 0;
          completedStepOutputTokens += usage.outputTokens ?? 0;
        },
        onToolExecutionStart: ({ toolCall }) =>
          emitToolProgress(input.onProgress, {
            type: "tool-start",
            id: `${runId}:${toolCall.toolCallId}`,
            toolCallId: toolCall.toolCallId,
            toolName: toolCall.toolName,
            agentName: input.resolved.agent.name,
            agentId: input.resolved.agent.id,
            runId,
            parentRunId: input.parentRunId ?? null,
            depth: input.depth,
            ...progressModelHistoryMetadata({
              depth: input.depth,
              isDelegation: Object.hasOwn(delegationTools, toolCall.toolName),
              phase: "start",
            }),
            input: toolCall.input,
          }),
        onToolExecutionEnd: ({ toolCall, toolExecutionMs, toolOutput }) => {
          const context = {
            id: `${runId}:${toolCall.toolCallId}`,
            toolCallId: toolCall.toolCallId,
            toolName: toolCall.toolName,
            agentName: input.resolved.agent.name,
            agentId: input.resolved.agent.id,
            runId,
            parentRunId: input.parentRunId ?? null,
            depth: input.depth,
            ...progressModelHistoryMetadata({
              depth: input.depth,
              isDelegation: Object.hasOwn(delegationTools, toolCall.toolName),
              phase: toolOutput.type === "tool-error" ? "error" : "success",
            }),
          } satisfies AgentToolProgressContext;
          if (toolOutput.type === "tool-error") {
            const executionError = toolOutput.error instanceof AgentExecutionError ? toolOutput.error : null;
            emitToolProgress(input.onProgress, {
              ...context,
              type: "tool-end",
              durationMs: toolExecutionMs,
              error: executionError?.safeDetail ? safeToolErrorMessage(new Error(executionError.safeDetail), "Tool execution failed") : safeToolErrorMessage(toolOutput.error, "Tool execution failed"),
              ...(executionError?.code ? { errorCode: executionError.code } : {}),
            });
            return;
          }
          emitToolProgress(input.onProgress, {
            ...context,
            type: "tool-end",
            durationMs: toolExecutionMs,
            output: toolOutput.output,
          });
        },
        telemetry: {
          functionId: "ai-hub.agent-run",
          recordInputs: false,
          recordOutputs: false,
        },
      });
    } catch (error) {
      const fallback = deterministicToolResultFallback(successfulToolResults, input.budget.policy.resultMaxChars);
      if (!input.budget.controller.signal.aborted && fallback && (deadline.timeoutSignal.aborted || isTimeoutFailure(error))) {
        inputTokens = completedStepInputTokens;
        outputTokens = completedStepOutputTokens;
        text = fallback;
        recoveredFromToolResult = true;
      } else {
        throw error;
      }
    }

    if (result) {
      inputTokens = result.usage.inputTokens ?? 0;
      outputTokens = result.usage.outputTokens ?? 0;
      text = result.text.trim();
      if (successfulToolResults.length === 0 && (result.toolResults?.length ?? 0) > 0) {
        successfulToolResults.push(
          ...result.toolResults.map((toolResult) => ({
            toolName: toolResult.toolName,
            output: toolResult.output,
          })),
        );
      }
      if (!text && successfulToolResults.length > 0) {
        const recoveryRemainingTokens = input.budget.policy.maxTotalTokens - input.budget.tokensUsed - inputTokens - outputTokens;
        if (recoveryRemainingTokens > 0 && !deadline.signal.aborted) {
          try {
            const recoveryResult = await generateText({
              model,
              system: `${system}\n\n${emptyResponseRecoveryInstruction}`,
              prompt: ["Original task:", input.prompt, "Successful tool results:", toolResultRecoveryContext(successfulToolResults, input.budget.policy.resultMaxChars)].join("\n\n"),
              temperature: input.resolved.version.temperature ? Number.parseFloat(input.resolved.version.temperature) : undefined,
              topP: input.resolved.version.topP ? Number.parseFloat(input.resolved.version.topP) : undefined,
              maxOutputTokens: Math.max(1, Math.min(runtimeLimits.maxOutputTokens, recoveryRemainingTokens)),
              abortSignal: deadline.signal,
              telemetry: {
                functionId: "ai-hub.agent-run.empty-response-recovery",
                recordInputs: false,
                recordOutputs: false,
              },
            });
            inputTokens += recoveryResult.usage.inputTokens ?? 0;
            outputTokens += recoveryResult.usage.outputTokens ?? 0;
            text = recoveryResult.text.trim();
            recoveredFromEmptyResponse = Boolean(text);
          } catch (error) {
            if (input.budget.controller.signal.aborted) throw error;
          }
        }
        if (!text && !input.budget.controller.signal.aborted) {
          text = deterministicToolResultFallback(successfulToolResults, input.budget.policy.resultMaxChars);
          recoveredFromToolResult = Boolean(text);
        }
      }
    }
    input.budget.tokensUsed += inputTokens + outputTokens;
    if (input.depth > 0 && input.budget.tokensUsed > input.budget.policy.maxTotalTokens) {
      throw new AgentExecutionError("Agent tree token budget exceeded", "AGENT_TOKEN_BUDGET_EXCEEDED", runId);
    }
    if (!text) {
      throw new AgentExecutionError("Agent completed without a final response", "AGENT_EMPTY_RESPONSE", runId);
    }
    await appendAgentRunStep({
      runId,
      sequence: allocateSequence(),
      kind: "model",
      status: "success",
      name: provider.modelId,
      inputPreview: { prompt: input.prompt },
      outputPreview: {
        text,
        inputTokens,
        outputTokens,
        recoveredFromEmptyResponse,
        recoveredFromToolResult,
      },
      completedAt: new Date(),
    });
    await completeAgentRun({
      runId,
      output: { text },
      inputTokens,
      outputTokens,
      reservationTokens: input.depth === 0 ? input.budget.tokensUsed : undefined,
      usage: {
        workspaceId: input.workspaceId,
        userId: input.userId,
        providerId: provider.providerId,
        modelId: provider.modelRecordId,
        agentId: input.resolved.agent.id,
        conversationId: input.conversationId ?? undefined,
        operation: input.trigger === "delegation" ? "delegation" : input.trigger,
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
      errorCode: error instanceof AgentExecutionError ? error.code : aborted ? "AGENT_RUN_CANCELLED" : "AGENT_RUN_FAILED",
      inputTokens,
      outputTokens,
      reservationTokens: input.depth === 0 ? input.budget.tokensUsed : undefined,
      usage: {
        workspaceId: input.workspaceId,
        userId: input.userId,
        providerId: usageProvider?.providerId,
        modelId: usageProvider?.modelRecordId,
        agentId: input.resolved.agent.id,
        conversationId: input.conversationId ?? undefined,
        operation: input.trigger === "delegation" ? "delegation" : input.trigger,
        latencyMs: Date.now() - startedAt,
      },
    });
    throw error instanceof AgentExecutionError ? new AgentExecutionError(error.message, error.code, runId, error.safeDetail) : new AgentExecutionError(aborted ? "Agent run was cancelled" : "Agent run failed", aborted ? "AGENT_RUN_CANCELLED" : "AGENT_RUN_FAILED", runId, safeToolErrorMessage(error, aborted ? "Agent run was cancelled" : "Agent run failed"));
  } finally {
    clearInterval(heartbeat);
    activeRunControllers.delete(runId);
  }
}
