import { failAgentRun } from "@/modules/agent/run-use-cases";
import { resolveProviderForVersion } from "@/modules/agent/use-cases";
import { safeToolErrorMessage } from "@/modules/tool/safe-payload";
import {
  AgentExecutionError,
  AgentExecutionResult,
  InternalExecutionInput,
  activeRunControllers,
} from "./runtime-executor.heartbeat-ms";
import { prepareResolvedAgentExecution } from "./runtime-executor.execute-resolved-agent.part-a";
import { generateResolvedAgentResponse } from "./runtime-executor.execute-resolved-agent.part-b";
import { finalizeResolvedAgentExecution } from "./runtime-executor.execute-resolved-agent.part-c";
import { startResolvedAgentRun } from "./runtime-executor.start-run";
import { recordAgentExecutionUsage } from "./runtime-executor.usage";

export async function executeResolvedAgent(
  input: InternalExecutionInput,
): Promise<AgentExecutionResult> {
  const { runId, heartbeat } = await startResolvedAgentRun(input);

  let inputTokens = 0;
  let outputTokens = 0;
  let usageRecorded = false;
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
    const prepared = await prepareResolvedAgentExecution(
      input,
      runId,
      provider,
    );
    const generated = await generateResolvedAgentResponse(
      input,
      runId,
      prepared,
    );
    inputTokens = generated.inputTokens;
    outputTokens = generated.outputTokens;
    const outcome = await finalizeResolvedAgentExecution(
      input,
      runId,
      prepared,
      generated,
      startedAt,
    );
    usageRecorded = true;
    return outcome;
  } catch (error) {
    const aborted = input.budget.controller.signal.aborted;
    if (!usageRecorded && inputTokens + outputTokens > 0)
      recordAgentExecutionUsage(input.budget, {
        modelId: usageProvider?.modelRecordId ?? null,
        inputTokens,
        outputTokens,
      });
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
      ? new AgentExecutionError(
          error.message,
          error.code,
          runId,
          error.safeDetail,
        )
      : new AgentExecutionError(
          aborted ? "Agent run was cancelled" : "Agent run failed",
          aborted ? "AGENT_RUN_CANCELLED" : "AGENT_RUN_FAILED",
          runId,
          safeToolErrorMessage(
            error,
            aborted ? "Agent run was cancelled" : "Agent run failed",
          ),
        );
  } finally {
    clearInterval(heartbeat);
    activeRunControllers.delete(runId);
  }
}
