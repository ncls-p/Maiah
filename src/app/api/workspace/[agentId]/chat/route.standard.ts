import { encryptValue } from "@/lib/crypto";
import { logger, logHandledError, logHandledWarning } from "@/lib/logger";
import {
  agentRuntimePolicy,
  createRuntimeDeadline,
} from "@/modules/agent/runtime-policy";
import { recordUsageEvent } from "@/modules/agent/use-cases";
import type { ChatAttachment } from "@/modules/chat/attachments";
import {
  failChatStreamDueToTimeout,
  isChatStreamHardTimeoutAbort,
  startChatStreamLeaseHeartbeat,
} from "@/modules/chat/chat-stream-lease";
import { createGenerationClock } from "@/modules/chat/generation-clock";
import {
  completeChatStream,
  createChatStreamResponse,
  createChatUIMessageStreamResponse,
  registerChatStreamAbortController,
} from "@/modules/chat/stream-bus";
import {
  projectToolMessagePayload,
  safeChatErrorMessage,
} from "@/modules/tool/safe-payload";
import { db } from "@/server/infrastructure/db";
import {
  conversations,
  messageParts,
  messages,
} from "@/server/infrastructure/db/schema";
import { isStepCount, ToolLoopAgent, type LanguageModel } from "ai";
import { and, eq } from "drizzle-orm";
import { after } from "next/server";
import { reasoningCallSettings } from "@/modules/agent/reasoning-presets";
import {
  fitModelHistoryToContext,
  resolveContextWindowTokens,
  type ConversationContextPolicy,
} from "@/modules/chat/conversation-context-policy";
import {
  knowledgeCitationsFromToolOutput,
  KNOWLEDGE_SEARCH_TOOL_NAME,
  projectStreamedToolInput,
  streamToolCallId,
  streamToolErrorOutput,
  streamToolInputDelta,
} from "./route-support";
import { completeStandardChat } from "./route.standard-completion";
import { prepareStandardChatConfig } from "./route.standard-config";
import {
  chatStreamHeaders,
  type ChatExecutionContext,
} from "./route.execution-context";
import { createStreamedPartWriter } from "./route.streamed-parts";

export async function runStandardChat(input: {
  context: ChatExecutionContext;
  model: LanguageModel;
  messageAttachments: ChatAttachment[];
  createdConversation: boolean;
  codeWorkspaceAttachment: unknown;
  requestStartedAt: number;
  enqueueEvent: (event: Record<string, unknown>) => void;
}) {
  const {
    context: executionContext,
    model,
    messageAttachments,
    createdConversation,
    codeWorkspaceAttachment,
    requestStartedAt,
    enqueueEvent,
  } = input;
  const {
    requestId,
    agentId,
    actorUserId,
    agent,
    version,
    providerConfig,
    conversation,
    assistantMessage,
    continuationClaim,
    generationHistory,
    useAiSdkUIStream,
  } = executionContext;
  const streamGenerationId = assistantMessage.streamGenerationId;
  if (!streamGenerationId) {
    throw new Error("Chat stream generation is missing its lease identity");
  }
  const {
    maxToolCalls,
    maxOutputTokens,
    maxSteps,
    boundToolConfig,
    tools,
    availableToolNames,
    configuredToolChoice,
    systemPrompt,
  } = await prepareStandardChatConfig({
    context: executionContext,
    messageAttachments,
    createdConversation,
    hasCodeWorkspaceAttachment: Boolean(codeWorkspaceAttachment),
    requestStartedAt,
    enqueueEvent,
  });
  const contextPolicy =
    version.memoryPolicyJson as ConversationContextPolicy | null;
  const fittedContext = fitModelHistoryToContext({
    messages: generationHistory,
    contextWindowTokens: resolveContextWindowTokens(
      contextPolicy?.contextWindowTokens,
      providerConfig.contextWindow,
    ),
    modelMaxOutputTokens: providerConfig.maxOutputTokens,
    requestedOutputTokens: maxOutputTokens,
    systemPrompt,
  });
  const modelHistory = fittedContext.messages;
  const startedAt = Date.now();
  const generationClock = createGenerationClock(startedAt);
  const partWriter = createStreamedPartWriter(
    assistantMessage.id,
    streamGenerationId,
    continuationClaim,
  );
  const postCompletionAutomationRef: {
    current: (() => Promise<void>) | null;
  } = { current: null };
  after(async () => {
    const job = postCompletionAutomationRef.current;
    if (!job) return;
    try {
      await job();
    } catch (error) {
      logHandledWarning("Failed to run chat post-processing", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
  const streamAbortController = new AbortController();
  registerChatStreamAbortController(
    assistantMessage.id,
    streamAbortController,
    streamGenerationId,
  );
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
  const generationSettings = version.generationSettingsJson as {
    topK?: number;
    presencePenalty?: number;
    frequencyPenalty?: number;
    seed?: number;
    maxRetries?: number;
    stopSequences?: string[];
    reasoningPresets?: string[];
  } | null;
  const reasoningSettings = reasoningCallSettings(
    executionContext.reasoningEffort,
    providerConfig.runtimeConfig,
  );
  const runtimeAgent = new ToolLoopAgent({
    id: version.id,
    model,
    instructions: systemPrompt,
    // Conversation summaries are trusted server-generated system messages.
    // AI SDK 7 rejects system messages in `messages` unless this is explicit.
    allowSystemInMessages: true,
    temperature: version.temperature
      ? Number.parseFloat(version.temperature)
      : undefined,
    topP: version.topP ? Number.parseFloat(version.topP) : undefined,
    topK: generationSettings?.topK,
    presencePenalty: generationSettings?.presencePenalty,
    frequencyPenalty: generationSettings?.frequencyPenalty,
    seed: generationSettings?.seed,
    maxRetries: generationSettings?.maxRetries,
    stopSequences: generationSettings?.stopSequences?.length
      ? generationSettings.stopSequences
      : undefined,
    maxOutputTokens: fittedContext.maxOutputTokens,
    ...reasoningSettings,
    tools,
    toolChoice: configuredToolChoice,
    toolApproval: boundToolConfig.toolApproval,
    toolOrder: availableToolNames,
    runtimeContext: {
      workspaceId: agent.workspaceId,
      userId: actorUserId,
      agentId,
      agentVersionId: version.id,
      conversationId: conversation.id,
    },
    telemetry: {
      functionId: "ai-hub.chat",
      recordInputs: false,
      recordOutputs: false,
      includeRuntimeContext: {
        workspaceId: true,
        userId: true,
        agentId: true,
        agentVersionId: true,
        conversationId: true,
      },
    },
    stopWhen: isStepCount(maxSteps),
    prepareStep:
      availableToolNames.length > 0
        ? ({ instructions, messages, steps }) => {
            const usedToolCalls = steps.reduce(
              (total, step) => total + step.toolCalls.length,
              0,
            );
            const reachedToolCallLimit = usedToolCalls >= maxToolCalls;
            const stepInstructions = reachedToolCallLimit
              ? `${systemPrompt}\n\nTool call limit reached. Do not call another tool. Answer the user now using the available conversation context and tool results. If the available information is incomplete, clearly say what is known and what is uncertain.`
              : typeof instructions === "string"
                ? instructions
                : systemPrompt;
            const stepContext = fitModelHistoryToContext({
              messages,
              contextWindowTokens: resolveContextWindowTokens(
                contextPolicy?.contextWindowTokens,
                providerConfig.contextWindow,
              ),
              modelMaxOutputTokens: providerConfig.maxOutputTokens,
              requestedOutputTokens: maxOutputTokens,
              systemPrompt: stepInstructions,
            });

            return reachedToolCallLimit
              ? {
                  activeTools: [],
                  toolChoice: "none",
                  instructions: stepInstructions,
                  messages: stepContext.messages,
                  maxOutputTokens: stepContext.maxOutputTokens,
                }
              : {
                  messages: stepContext.messages,
                  maxOutputTokens: stepContext.maxOutputTokens,
                };
          }
        : undefined,
  });
  const runtimeDeadline = createRuntimeDeadline(
    agentRuntimePolicy.chatTimeoutMs,
    streamAbortController.signal,
  );
  const result = await runtimeAgent.stream({
    abortSignal: runtimeDeadline.signal,
    messages: modelHistory,
  });
  const streamedToolInputs = new Map<string, string>();
  const streamedToolNames = new Map<string, string>();
  const invalidToolCallErrors = new Map<string, unknown>();

  void (async () => {
    try {
      for await (const part of result.stream) {
        generationClock.observe(part.type, streamToolCallId(part) || undefined);
        if (part.type === "text-delta") {
          await partWriter.appendText("text", part.text);
          enqueueEvent({ type: "text", delta: part.text });
        } else if (part.type === "reasoning-start") {
          await partWriter.appendText("reasoning", "");
          enqueueEvent({ type: "reasoning_start" });
        } else if (part.type === "reasoning-delta") {
          await partWriter.appendText("reasoning", part.text);
          enqueueEvent({ type: "reasoning", delta: part.text });
        } else if (part.type === "reasoning-end") {
          enqueueEvent({ type: "reasoning_end" });
        } else if (part.type === "tool-input-start") {
          const toolCallId = streamToolCallId(part);
          if (toolCallId) {
            streamedToolInputs.set(toolCallId, "");
            streamedToolNames.set(toolCallId, part.toolName);
            enqueueEvent({
              type: "tool_input_start",
              toolCallId,
              toolName: part.toolName,
            });
          }
        } else if (part.type === "tool-input-delta") {
          const toolCallId = streamToolCallId(part);
          const delta = streamToolInputDelta(part);
          if (toolCallId && delta) {
            const inputText = `${streamedToolInputs.get(toolCallId) ?? ""}${delta}`;
            streamedToolInputs.set(toolCallId, inputText);
            const safeInputText = await projectStreamedToolInput(inputText);
            if (safeInputText) {
              enqueueEvent({
                type: "tool_input_snapshot",
                toolCallId,
                toolName: streamedToolNames.get(toolCallId) ?? "tool",
                inputText: safeInputText,
              });
            }
          }
        } else if (part.type === "tool-input-end") {
          const toolCallId = streamToolCallId(part);
          if (toolCallId) {
            enqueueEvent({
              type: "tool_input_end",
              toolCallId,
            });
          }
        } else if (part.type === "tool-call") {
          streamedToolInputs.delete(part.toolCallId);
          streamedToolNames.delete(part.toolCallId);
          if (part.invalid) {
            invalidToolCallErrors.set(part.toolCallId, part.error);
          }
          await partWriter.appendMetadata("tool-call", part);
          enqueueEvent({
            type: "tool_call",
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            input: projectToolMessagePayload(part.input),
          });
        } else if (part.type === "tool-result") {
          await partWriter.appendMetadata("tool-result", part);
          enqueueEvent({
            type: "tool_result",
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            output: projectToolMessagePayload(part.output),
          });
          if (part.toolName === KNOWLEDGE_SEARCH_TOOL_NAME) {
            const knowledgeCitations = knowledgeCitationsFromToolOutput(
              part.output,
            );
            if (knowledgeCitations.length > 0) {
              await partWriter.appendCitations(knowledgeCitations);
              enqueueEvent({
                type: "citations",
                citations: knowledgeCitations,
              });
            }
          }
        } else if (part.type === "tool-error") {
          const output = streamToolErrorOutput(
            part,
            invalidToolCallErrors.get(part.toolCallId),
          );
          invalidToolCallErrors.delete(part.toolCallId);
          const toolResult = {
            type: "tool-result" as const,
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            input: projectToolMessagePayload(part.input),
            output,
          };
          await partWriter.appendMetadata("tool-result", toolResult);
          enqueueEvent({
            type: "tool_result",
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            output,
          });
        } else if (part.type === "error") {
          const error =
            part.error instanceof Error
              ? part.error
              : new Error(String(part.error));
          const errorMessage = safeChatErrorMessage(
            error,
            "Assistant generation failed",
          );
          throw new Error(errorMessage);
        }
      }

      const timings = generationClock.snapshot();
      const totalUsage = await result.usage;
      await completeStandardChat({
        context: executionContext,
        model,
        totalUsage,
        partWriter,
        postCompletionAutomationRef,
        startedAt,
        timings,
        enqueueEvent,
      });
    } catch (error) {
      if (
        streamAbortController.signal.aborted &&
        !isChatStreamHardTimeoutAbort(streamAbortController.signal)
      ) {
        const cancelledAt = new Date();
        const transitioned = await db.transaction(async (tx) => {
          const [cancelled] = await tx
            .update(messages)
            .set({
              status: "cancelled",
              completedAt: cancelledAt,
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
          if (!cancelled) return false;
          await tx
            .update(conversations)
            .set({ updatedAt: cancelledAt })
            .where(eq(conversations.id, conversation.id));
          return true;
        });
        if (transitioned) {
          logger.info("Chat stream aborted by client", {
            requestId,
            agentId,
            agentVersionId: version.id,
            workspaceId: agent.workspaceId,
            userId: actorUserId,
            conversationId: conversation.id,
            assistantMessageId: assistantMessage.id,
            latencyMs: Date.now() - startedAt,
          });
          enqueueEvent({ type: "done", stopped: true });
        }
      } else {
        const streamError = runtimeDeadline.timeoutSignal.aborted
          ? new Error(hardTimeoutError)
          : error;
        const errorMessage = safeChatErrorMessage(
          streamError,
          "Assistant generation failed",
        );
        const failedAt = new Date();
        const transitioned = await db.transaction(async (tx) => {
          const [failed] = await tx
            .update(messages)
            .set({
              status: "failed",
              completedAt: failedAt,
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
          if (!failed) return false;
          await tx.insert(messageParts).values({
            messageId: assistantMessage.id,
            type: "error",
            contentEncrypted: await encryptValue(errorMessage),
            metadataJson: null,
            sortOrder: partWriter.nextSortOrder,
          });
          await tx
            .update(conversations)
            .set({ updatedAt: failedAt })
            .where(eq(conversations.id, conversation.id));
          return true;
        });
        if (!transitioned) return;
        await recordUsageEvent({
          workspaceId: agent.workspaceId,
          userId: actorUserId,
          providerId: providerConfig.providerId,
          modelId: providerConfig.modelRecordId,
          agentId,
          conversationId: conversation.id,
          operation: "chat",
          latencyMs: Date.now() - startedAt,
          status: "failed",
        });
        logHandledError(
          "Chat stream failed",
          {
            requestId,
            agentId,
            agentVersionId: version.id,
            workspaceId: agent.workspaceId,
            userId: actorUserId,
            conversationId: conversation.id,
            assistantMessageId: assistantMessage.id,
            latencyMs: Date.now() - startedAt,
          },
          streamError as Error,
        );
        enqueueEvent({ type: "error", error: errorMessage });
      }
    } finally {
      try {
        await boundToolConfig.dispose();
      } finally {
        try {
          await stopLeaseHeartbeat();
        } finally {
          completeChatStream(assistantMessage.id, streamGenerationId);
        }
      }
    }
  })();

  const streamHeaders = chatStreamHeaders(executionContext);

  return useAiSdkUIStream
    ? createChatUIMessageStreamResponse(assistantMessage.id, streamHeaders, {
        generationId: streamGenerationId,
      })
    : createChatStreamResponse(assistantMessage.id, streamHeaders, {
        generationId: streamGenerationId,
      });
}
