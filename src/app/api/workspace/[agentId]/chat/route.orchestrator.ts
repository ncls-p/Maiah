import { agentRuntimePolicy } from "@/modules/agent/runtime-policy";
import type { executeAgent } from "@/modules/agent/runtime-executor";
import { createGenerationClock } from "@/modules/chat/generation-clock";
import {
  failChatStreamDueToTimeout,
  startChatStreamLeaseHeartbeat,
} from "@/modules/chat/chat-stream-lease";
import {
  completeChatStream,
  createChatStreamResponse,
  createChatUIMessageStreamResponse,
  publishChatStreamEvent,
  registerChatStreamAbortController,
} from "@/modules/chat/stream-bus";

import {
  chatStreamHeaders,
  type ChatExecutionContext,
} from "./route.execution-context";
import { createOrchestrationProgress } from "./route.orchestration-progress";
import { runOrchestratorChatCore } from "./route.orchestrator.part-a";
import { handleOrchestratorChatFailure } from "./route.orchestrator.part-b";

export function runOrchestratorChat(context: ChatExecutionContext) {
  const startedAt = Date.now();
  const { assistantMessage, continuationClaim, userMessage, useAiSdkUIStream } =
    context;
  const streamAbortController = new AbortController();
  const streamGenerationId = assistantMessage.streamGenerationId;
  if (!streamGenerationId) {
    throw new Error("Chat stream generation is missing its lease identity");
  }
  registerChatStreamAbortController(
    assistantMessage.id,
    streamAbortController,
    streamGenerationId,
  );
  const enqueueEvent = (event: Record<string, unknown>) =>
    publishChatStreamEvent(assistantMessage.id, event, streamGenerationId);
  const hardTimeoutError =
    "Assistant generation timed out before it could finish. Try again with a narrower request.";
  const stopLeaseHeartbeat = startChatStreamLeaseHeartbeat(
    assistantMessage.id,
    streamGenerationId,
    streamAbortController,
    {
      hardTimeoutMs: agentRuntimePolicy.chatTimeoutMs,
      onHardTimeout: async () => {
        const transitioned = await failChatStreamDueToTimeout({
          messageId: assistantMessage.id,
          generationId: streamGenerationId,
          errorMessage: hardTimeoutError,
        });
        if (!transitioned) return;
        enqueueEvent({ type: "error", error: hardTimeoutError });
        completeChatStream(assistantMessage.id, streamGenerationId);
      },
    },
  );
  const completedRunRef: {
    current: Awaited<ReturnType<typeof executeAgent>> | null;
  } = { current: null };
  const initialSortOrder = continuationClaim?.nextSortOrder ?? 0;
  const generationClock = createGenerationClock(startedAt);
  const progress = createOrchestrationProgress({
    requestId: context.requestId,
    agentId: context.agentId,
    assistantMessageId: assistantMessage.id,
    streamGenerationId,
    enqueueEvent,
    initialSortOrder,
  });
  void (async () => {
    try {
      await runOrchestratorChatCore({
        context,
        streamGenerationId,
        streamAbortController,
        enqueueEvent,
        generationClock,
        progress,
        initialSortOrder,
        completedRun: completedRunRef,
      });
    } catch (error) {
      await handleOrchestratorChatFailure({
        error,
        context,
        streamAbortController,
        streamGenerationId,
        hardTimeoutError,
        enqueueEvent,
        progress,
        completedRun: completedRunRef,
      });
    } finally {
      try {
        await stopLeaseHeartbeat();
      } finally {
        completeChatStream(assistantMessage.id, streamGenerationId);
      }
    }
  })();
  const headers = chatStreamHeaders({ ...context, userMessage });
  return useAiSdkUIStream
    ? createChatUIMessageStreamResponse(assistantMessage.id, headers, {
        generationId: streamGenerationId,
      })
    : createChatStreamResponse(assistantMessage.id, headers, {
        generationId: streamGenerationId,
      });
}
