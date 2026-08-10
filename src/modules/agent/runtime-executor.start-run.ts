import {
  claimAgentRun,
  createAgentRun,
  heartbeatAgentRun,
} from "@/modules/agent/run-use-cases";

import {
  activeRunControllers,
  AgentRunStateError,
  HEARTBEAT_MS,
  type InternalExecutionInput,
} from "./runtime-executor.heartbeat-ms";

export async function startResolvedAgentRun(input: InternalExecutionInput) {
  const created = input.existingRunId
    ? { run: { id: input.existingRunId } }
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
  if (!(await claimAgentRun({ runId, leaseOwner }))) {
    activeRunControllers.delete(runId);
    throw new AgentRunStateError(runId, "not claimable");
  }
  const heartbeat = setInterval(() => {
    void heartbeatAgentRun({ runId, leaseOwner }).then((alive) => {
      if (!alive) input.budget.controller.abort("Agent run lease was lost");
    });
  }, HEARTBEAT_MS);
  heartbeat.unref?.();
  return { runId, heartbeat };
}
