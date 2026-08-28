import { fitModelHistoryToContext } from "@/modules/chat/conversation-context-policy";
import { safeToolErrorMessage } from "@/modules/tool/safe-payload";
import { generateText, isStepCount } from "ai";
import {
  AgentExecutionError,
  AgentToolProgressContext,
  InternalExecutionInput,
  emitToolProgress,
  emptyResponseRecoveryInstruction,
  finalSynthesisInstruction,
} from "./runtime-executor.heartbeat-ms";
import {
  deterministicToolResultFallback,
  isTimeoutFailure,
  progressModelHistoryMetadata,
  toolResultRecoveryContext,
} from "./runtime-executor.instrument-tools";
import type { PreparedAgentExecution } from "./runtime-executor.execute-resolved-agent.part-a";

export interface GeneratedAgentResponse {
  inputTokens: number;
  outputTokens: number;
  text: string;
  recoveredFromEmptyResponse: boolean;
  recoveredFromToolResult: boolean;
}

export async function generateResolvedAgentResponse(
  input: InternalExecutionInput,
  runId: string,
  prepared: PreparedAgentExecution,
): Promise<GeneratedAgentResponse> {
  const {
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
  } = prepared;
  let inputTokens = 0;
  let outputTokens = 0;
  let completedStepInputTokens = 0;
  let completedStepOutputTokens = 0;
  let result: Awaited<ReturnType<typeof generateText>> | undefined;
  let text = "";
  let recoveredFromEmptyResponse = false;
  let recoveredFromToolResult = false;
  try {
    result = await generateText({
      model,
      instructions: system,
      // Chat summaries are trusted, server-generated system history.
      allowSystemInMessages: true,
      ...(fittedContext
        ? { messages: fittedContext.messages }
        : { prompt: input.prompt }),
      temperature: input.resolved.version.temperature
        ? Number.parseFloat(input.resolved.version.temperature)
        : undefined,
      topP: input.resolved.version.topP
        ? Number.parseFloat(input.resolved.version.topP)
        : undefined,
      maxOutputTokens: fittedContext?.maxOutputTokens ?? maxOutputTokens,
      ...reasoningSettings,
      tools,
      toolChoice: configuredToolChoice,
      toolApproval: bound.toolApproval,
      stopWhen: isStepCount(Math.max(1, effectiveMaxSteps)),
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
            isDelegation: toolCall.toolName.startsWith("delegate_specialist_"),
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
            isDelegation: toolCall.toolName.startsWith("delegate_specialist_"),
            phase: toolOutput.type === "tool-error" ? "error" : "success",
          }),
        } satisfies AgentToolProgressContext;
        if (toolOutput.type === "tool-error") {
          const executionError =
            toolOutput.error instanceof AgentExecutionError
              ? toolOutput.error
              : null;
          emitToolProgress(input.onProgress, {
            ...context,
            type: "tool-end",
            durationMs: toolExecutionMs,
            error: executionError?.safeDetail
              ? safeToolErrorMessage(
                  new Error(executionError.safeDetail),
                  "Tool execution failed",
                )
              : safeToolErrorMessage(toolOutput.error, "Tool execution failed"),
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
    const fallback = deterministicToolResultFallback(
      successfulToolResults,
      input.budget.policy.resultMaxChars,
    );
    if (
      !input.budget.controller.signal.aborted &&
      fallback &&
      (deadline.timeoutSignal.aborted || isTimeoutFailure(error))
    ) {
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
    if (
      successfulToolResults.length === 0 &&
      (result.toolResults?.length ?? 0) > 0
    ) {
      successfulToolResults.push(
        ...result.toolResults.map((toolResult) => ({
          toolName: toolResult.toolName,
          output: toolResult.output,
        })),
      );
    }
    if (!text && successfulToolResults.length > 0) {
      const recoveryRemainingTokens =
        input.budget.policy.maxTotalTokens -
        input.budget.tokensUsed -
        inputTokens -
        outputTokens;
      if (recoveryRemainingTokens > 0 && !deadline.signal.aborted) {
        try {
          const recoveryInstructions = `${system}\n\n${emptyResponseRecoveryInstruction}`;
          const recoveryPrompt = [
            "Original task:",
            input.prompt,
            "Successful tool results:",
            toolResultRecoveryContext(
              successfulToolResults,
              input.budget.policy.resultMaxChars,
            ),
          ].join("\n\n");
          const recoveryContext = fitModelHistoryToContext({
            messages: [{ role: "user", content: recoveryPrompt }],
            contextWindowTokens:
              contextPolicy?.contextWindowTokens && provider.contextWindow
                ? Math.min(
                    contextPolicy.contextWindowTokens,
                    provider.contextWindow,
                  )
                : (contextPolicy?.contextWindowTokens ??
                  provider.contextWindow),
            requestedOutputTokens: Math.max(
              1,
              Math.min(runtimeLimits.maxOutputTokens, recoveryRemainingTokens),
            ),
            systemPrompt: recoveryInstructions,
          });
          const recoveryResult = await generateText({
            model,
            instructions: recoveryInstructions,
            messages: recoveryContext.messages,
            temperature: input.resolved.version.temperature
              ? Number.parseFloat(input.resolved.version.temperature)
              : undefined,
            topP: input.resolved.version.topP
              ? Number.parseFloat(input.resolved.version.topP)
              : undefined,
            maxOutputTokens: recoveryContext.maxOutputTokens,
            ...reasoningSettings,
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
        text = deterministicToolResultFallback(
          successfulToolResults,
          input.budget.policy.resultMaxChars,
        );
        recoveredFromToolResult = Boolean(text);
      }
    }
  }
  return {
    inputTokens,
    outputTokens,
    text,
    recoveredFromEmptyResponse,
    recoveredFromToolResult,
  };
}
