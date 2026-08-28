import { logHandledError } from "@/lib/logger";
import { AgentExecutionError } from "@/modules/agent/runtime-executor";
import type { executeAgent } from "@/modules/agent/runtime-executor";
import { isChatStreamHardTimeoutAbort } from "@/modules/chat/chat-stream-lease";
import { safeToolErrorMessage } from "@/modules/tool/safe-payload";
import { db } from "@/server/infrastructure/db";
import {
  conversations,
  messages,
} from "@/server/infrastructure/db/schema";
import { and, eq } from "drizzle-orm";

import type { ChatExecutionContext } from "./route.execution-context";
import type { createOrchestrationProgress } from "./route.orchestration-progress";

type OrchestrationProgress = ReturnType<typeof createOrchestrationProgress>;
type CompletedAgentRun = Awaited<ReturnType<typeof executeAgent>>;

export async function handleOrchestratorChatFailure(input: {
  error: unknown;
  context: ChatExecutionContext;
  streamAbortController: AbortController;
  streamGenerationId: string;
  hardTimeoutError: string;
  enqueueEvent: (event: Record<string, unknown>) => void;
  progress: OrchestrationProgress;
  completedRun: { current: CompletedAgentRun | null };
}): Promise<void> {
  const {
    error,
    context,
    streamAbortController,
    streamGenerationId,
    hardTimeoutError,
    enqueueEvent,
    progress,
    completedRun,
  } = input;
  const { agent, agentId, conversation, assistantMessage, requestId } = context;
  const aborted = streamAbortController.signal.aborted;
  const hardTimedOut = isChatStreamHardTimeoutAbort(
    streamAbortController.signal,
  );
  await progress.flush();
  const terminalAt = new Date();
  const transitioned = await db.transaction(async (tx) => {
    const [terminal] = await tx
      .update(messages)
      .set({
        status: aborted && !hardTimedOut ? "cancelled" : "failed",
        completedAt: terminalAt,
        streamLeaseExpiresAt: null,
      })
      .where(
        and(
          eq(messages.id, assistantMessage.id),
          eq(messages.status, "streaming"),
          eq(messages.streamGenerationId, streamGenerationId),
        ),
      )
      .returning({ id: messages.id });
    if (!terminal) return false;
    await tx
      .update(conversations)
      .set({ updatedAt: terminalAt })
      .where(eq(conversations.id, conversation.id));
    return true;
  });
  if (!transitioned) return;
  if (aborted && !hardTimedOut)
    enqueueEvent({ type: "done", stopped: true });
  else
    enqueueEvent({
      type: "error",
      error: completedRun.current
        ? "The agent run completed, but its response could not be saved. Open the run history to recover the result."
        : hardTimedOut
          ? hardTimeoutError
          : safeToolErrorMessage(
              error,
              "Orchestration failed. Review the run trace and try again.",
            ),
    });
  logHandledError(
    "Orchestrator chat run failed",
    {
      requestId,
      agentId,
      workspaceId: agent.workspaceId,
      conversationId: conversation.id,
      assistantMessageId: assistantMessage.id,
      errorCode:
        error instanceof AgentExecutionError
          ? error.code
          : "AGENT_RUN_FAILED",
      runId: error instanceof AgentExecutionError ? (error.runId ?? null) : null,
      errorDetail:
        error instanceof AgentExecutionError
          ? (error.safeDetail ?? null)
          : safeToolErrorMessage(error, "Agent run failed"),
    },
    error as Error,
  );
}