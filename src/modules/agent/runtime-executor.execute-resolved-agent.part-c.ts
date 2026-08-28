import {
  appendAgentRunStep,
  completeAgentRun,
} from "@/modules/agent/run-use-cases";
import {
  AgentExecutionError,
  AgentExecutionResult,
  InternalExecutionInput,
} from "./runtime-executor.heartbeat-ms";
import type { PreparedAgentExecution } from "./runtime-executor.execute-resolved-agent.part-a";
import type { GeneratedAgentResponse } from "./runtime-executor.execute-resolved-agent.part-b";
import { collectAgentVisualOutputs } from "./runtime-executor.visual-outputs";
import { recordAgentExecutionUsage } from "./runtime-executor.usage";

export async function finalizeResolvedAgentExecution(
  input: InternalExecutionInput,
  runId: string,
  prepared: PreparedAgentExecution,
  generated: GeneratedAgentResponse,
  startedAt: number,
): Promise<AgentExecutionResult> {
  const {
    inputTokens,
    outputTokens,
    text,
    recoveredFromEmptyResponse,
    recoveredFromToolResult,
  } = generated;
  const { provider, successfulToolResults, allocateSequence } = prepared;
  input.budget.tokensUsed += inputTokens + outputTokens;
  if (
    input.depth > 0 &&
    input.budget.tokensUsed > input.budget.policy.maxTotalTokens
  ) {
    throw new AgentExecutionError(
      "Agent tree token budget exceeded",
      "AGENT_TOKEN_BUDGET_EXCEEDED",
      runId,
    );
  }
  if (!text) {
    throw new AgentExecutionError(
      "Agent completed without a final response",
      "AGENT_EMPTY_RESPONSE",
      runId,
    );
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
  const usageBreakdown = recordAgentExecutionUsage(input.budget, {
    modelId: provider.modelRecordId ?? null,
    inputTokens,
    outputTokens,
  });
  return {
    runId,
    text,
    inputTokens,
    outputTokens,
    totalTreeTokens: input.budget.tokensUsed,
    usageBreakdown: [...usageBreakdown],
    reused: false,
    visualOutputs: collectAgentVisualOutputs(successfulToolResults),
  };
}