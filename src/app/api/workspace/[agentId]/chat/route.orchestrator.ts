import { encryptValue } from "@/lib/crypto";
import { logHandledError } from "@/lib/logger";
import {
  AgentExecutionError,
  executeAgent,
} from "@/modules/agent/runtime-executor";
import {
  completeChatStream,
  createChatStreamResponse,
  createChatUIMessageStreamResponse,
  publishChatStreamEvent,
  registerChatStreamAbortController,
} from "@/modules/chat/stream-bus";
import { safeToolErrorMessage } from "@/modules/tool/safe-payload";
import { db } from "@/server/infrastructure/db";
import {
  conversations,
  messageParts,
  messages,
} from "@/server/infrastructure/db/schema";
import { eq } from "drizzle-orm";

import { accumulateTokenCount } from "./route.accumulate-token-count";
import {
  chatStreamHeaders,
  type ChatExecutionContext,
} from "./route.execution-context";
import {
  createOrchestrationProgress,
  projectOrchestrationProgress,
} from "./route.orchestration-progress";

export function runOrchestratorChat(context: ChatExecutionContext) {
  const {
    requestId,
    agentId,
    agent,
    actorUserId,
    version,
    conversation,
    userMessage,
    assistantMessage,
    continuationClaim,
    content,
    history,
    availableAttachments,
    useAiSdkUIStream,
  } = context;
  const streamAbortController = new AbortController();
  registerChatStreamAbortController(assistantMessage.id, streamAbortController);
  const enqueueEvent = (event: Record<string, unknown>) =>
    publishChatStreamEvent(assistantMessage.id, event);
  let completedRun: Awaited<ReturnType<typeof executeAgent>> | null = null;
  const initialSortOrder = continuationClaim?.nextSortOrder ?? 0;
  const progress = createOrchestrationProgress({
    requestId,
    agentId,
    assistantMessageId: assistantMessage.id,
    enqueueEvent,
    initialSortOrder,
  });
  void (async () => {
    try {
      const result = await executeAgent({
        workspaceId: agent.workspaceId,
        userId: actorUserId,
        agentId,
        agentVersionId: version.id,
        prompt: content,
        messages: history,
        availableAttachments,
        trigger: "chat",
        conversationId: conversation.id,
        messageId: assistantMessage.id,
        idempotencyKey: `chat:${assistantMessage.id}`,
        abortSignal: streamAbortController.signal,
        onProgress: progress.queue,
      });
      completedRun = result;
      await progress.flush();
      const completedAt = new Date();
      const encryptedText = result.text
        ? await encryptValue(result.text)
        : null;
      const durableDelegationParts = await Promise.all(
        progress.durableDelegationProgress.map(
          async ({ progress: event, sortOrder }) => {
            const projected = projectOrchestrationProgress(event);
            return {
              messageId: assistantMessage.id,
              type: projected.isStart
                ? ("tool-call" as const)
                : ("tool-result" as const),
              contentEncrypted: await encryptValue(
                JSON.stringify(projected.rawMetadata),
              ),
              metadataJson: projected.safeMetadata,
              sortOrder,
            };
          },
        ),
      );
      await db.transaction(async (tx) => {
        if (durableDelegationParts.length > 0)
          await tx.insert(messageParts).values(durableDelegationParts);
        if (
          result.text &&
          continuationClaim?.appendableTextPart &&
          progress.nextSortOrder === initialSortOrder
        ) {
          await tx
            .update(messageParts)
            .set({
              contentEncrypted: await encryptValue(
                `${continuationClaim.appendableTextPart.content}${result.text}`,
              ),
            })
            .where(
              eq(messageParts.id, continuationClaim.appendableTextPart.id),
            );
        } else if (encryptedText) {
          await tx.insert(messageParts).values({
            messageId: assistantMessage.id,
            type: "text",
            contentEncrypted: encryptedText,
            sortOrder: progress.allocateSortOrder(),
          });
        }
        await tx
          .update(messages)
          .set({
            status: "completed",
            tokenInput: accumulateTokenCount(
              continuationClaim?.message.tokenInput ?? null,
              result.inputTokens,
            ),
            tokenOutput: accumulateTokenCount(
              continuationClaim?.message.tokenOutput ?? null,
              result.outputTokens,
            ),
            completedAt,
          })
          .where(eq(messages.id, assistantMessage.id));
        await tx
          .update(conversations)
          .set({
            agentId,
            agentVersionId: version.id,
            sidebarOrder: null,
            updatedAt: completedAt,
          })
          .where(eq(conversations.id, conversation.id));
      });
      if (result.text) enqueueEvent({ type: "text", delta: result.text });
      enqueueEvent({ type: "done" });
    } catch (error) {
      const aborted = streamAbortController.signal.aborted;
      await progress.flush();
      await db
        .update(messages)
        .set({
          status: aborted ? "completed" : "failed",
          completedAt: new Date(),
        })
        .where(eq(messages.id, assistantMessage.id));
      if (aborted) enqueueEvent({ type: "done", stopped: true });
      else
        enqueueEvent({
          type: "error",
          error: completedRun
            ? "The agent run completed, but its response could not be saved. Open the run history to recover the result."
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
          runId:
            error instanceof AgentExecutionError ? (error.runId ?? null) : null,
          errorDetail:
            error instanceof AgentExecutionError
              ? (error.safeDetail ?? null)
              : safeToolErrorMessage(error, "Agent run failed"),
        },
        error as Error,
      );
    } finally {
      completeChatStream(assistantMessage.id);
    }
  })();
  const headers = chatStreamHeaders({ ...context, userMessage });
  return useAiSdkUIStream
    ? createChatUIMessageStreamResponse(assistantMessage.id, headers)
    : createChatStreamResponse(assistantMessage.id, headers);
}
