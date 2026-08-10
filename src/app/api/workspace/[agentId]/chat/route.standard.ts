import { encryptValue } from "@/lib/crypto";
import { logger, logHandledError, logHandledWarning } from "@/lib/logger";
import {
  agentRuntimePolicy,
  createRuntimeDeadline,
} from "@/modules/agent/runtime-policy";
import { recordUsageEvent } from "@/modules/agent/use-cases";
import type { ChatAttachment } from "@/modules/chat/attachments";
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
import { messageParts, messages } from "@/server/infrastructure/db/schema";
import { stepCountIs, ToolLoopAgent, type LanguageModel } from "ai";
import { eq } from "drizzle-orm";
import { after } from "next/server";
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
  const toolLimitFinalAnswerPrompt =
    "Tool call limit reached. Do not call another tool. Answer the user now using the available conversation context and tool results. If the available information is incomplete, clearly say what is known and what is uncertain.";
  const startedAt = Date.now();
  const partWriter = createStreamedPartWriter(
    assistantMessage.id,
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
  registerChatStreamAbortController(assistantMessage.id, streamAbortController);
  const generationSettings = version.generationSettingsJson as {
    topK?: number;
    presencePenalty?: number;
    frequencyPenalty?: number;
    seed?: number;
    maxRetries?: number;
    stopSequences?: string[];
  } | null;
  const runtimeAgent = new ToolLoopAgent({
    id: version.id,
    model,
    instructions: systemPrompt,
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
    maxOutputTokens,
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
    stopWhen: stepCountIs(maxSteps),
    prepareStep:
      availableToolNames.length > 0
        ? ({ steps }) => {
            const usedToolCalls = steps.reduce(
              (total, step) => total + step.toolCalls.length,
              0,
            );
            if (usedToolCalls < maxToolCalls) return undefined;

            return {
              activeTools: [],
              toolChoice: "none",
              instructions: `${systemPrompt}\n\n${toolLimitFinalAnswerPrompt}`,
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
    messages: generationHistory,
  });
  const streamedToolInputs = new Map<string, string>();
  const streamedToolNames = new Map<string, string>();
  const invalidToolCallErrors = new Map<string, unknown>();

  void (async () => {
    try {
      for await (const part of result.stream) {
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

      const totalUsage = await result.usage;
      await completeStandardChat({
        context: executionContext,
        model,
        totalUsage,
        partWriter,
        postCompletionAutomationRef,
        startedAt,
        enqueueEvent,
      });
    } catch (error) {
      if (streamAbortController.signal.aborted) {
        await db
          .update(messages)
          .set({ status: "completed", completedAt: new Date() })
          .where(eq(messages.id, assistantMessage.id));
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
      } else {
        const streamError = runtimeDeadline.timeoutSignal.aborted
          ? new Error(
              "Assistant run timed out before it could finish. Try again with a narrower request.",
            )
          : error;
        const errorMessage = safeChatErrorMessage(
          streamError,
          "Assistant generation failed",
        );
        // Chat stream failed — message already marked failed below
        await db
          .update(messages)
          .set({ status: "failed", completedAt: new Date() })
          .where(eq(messages.id, assistantMessage.id));
        await db.insert(messageParts).values({
          messageId: assistantMessage.id,
          type: "error",
          contentEncrypted: await encryptValue(errorMessage),
          metadataJson: null,
          sortOrder: partWriter.nextSortOrder,
        });
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
        enqueueEvent({
          type: "error",
          error: errorMessage,
        });
      }
    } finally {
      completeChatStream(assistantMessage.id);
    }
  })();

  const streamHeaders = chatStreamHeaders(executionContext);

  return useAiSdkUIStream
    ? createChatUIMessageStreamResponse(assistantMessage.id, streamHeaders)
    : createChatStreamResponse(assistantMessage.id, streamHeaders);
}
