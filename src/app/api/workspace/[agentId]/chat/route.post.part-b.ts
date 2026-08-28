import { logger } from "@/lib/logger";
import { publishChatStreamEvent } from "@/modules/chat/stream-bus";
import { loadConversationHistory } from "./route-history";
import { runOrchestratorChat } from "./route.orchestrator";
import { loadAuthorizedConversationAttachments } from "./route.orchestrator-attachments";
import { prepareChatConversation } from "./route.prepare-conversation";
import { runStandardChat } from "./route.standard";
import { getAdapter } from "@/server/infrastructure/providers";
import { extractReasoningMiddleware, wrapLanguageModel } from "ai";
import { NextResponse } from "next/server";

import type { ValidatedChatRequest } from "./route.post.part-a";

export async function executePreparedChatRequest(
  input: ValidatedChatRequest & {
    agentId: string;
    requestId: string;
    requestStartedAt: number;
  },
): Promise<{
  response: Response;
  userMessageId: string | undefined;
  assistantMessageId: string | undefined;
  assistantStreamGenerationId: string | undefined;
  createdUserMessage: boolean;
}> {
  const {
    agent,
    actorUserId,
    agentId,
    requestId,
    requestStartedAt,
    content,
    existingConversationId,
    ephemeral,
    ephemeralTtlMinutes,
    resendFromMessageId,
    regenerateAssistantMessageId,
    continueFromMessageId,
    capabilityOverrides,
    reasoningEffort,
    useAiSdkUIStream,
    codeWorkspaceAttachment,
    messageAttachments,
  } = input;
  const rejectChatRequest = (
    status: number,
    reason: string,
    body: unknown,
    context: Record<string, unknown> = {},
  ) => {
    logger.warn("Chat request rejected", {
      requestId,
      status,
      reason,
      durationMs: Date.now() - requestStartedAt,
      ...context,
    });
    return NextResponse.json(body, {
      status,
      headers: { "x-request-id": requestId },
    });
  };
  const preparedConversation = await prepareChatConversation({
    agent,
    actorUserId,
    agentId,
    content,
    existingConversationId,
    ephemeral,
    ephemeralTtlMinutes,
    resendFromMessageId,
    regenerateAssistantMessageId,
    continueFromMessageId,
    codeWorkspaceAttachment,
    messageAttachments,
    reasoningEffort,
    rejectChatRequest,
  });
  if (preparedConversation instanceof Response)
    return {
      response: preparedConversation,
      userMessageId: undefined,
      assistantMessageId: undefined,
      assistantStreamGenerationId: undefined,
      createdUserMessage: false,
    };
  const {
    conversation,
    createdConversation,
    version,
    providerConfig,
    continuationClaim,
    userMessage,
    assistantMessage,
    shouldRegenerateConversationTitle,
  } = preparedConversation;
  const userMessageId = preparedConversation.userMessageId;
  const assistantMessageId = preparedConversation.assistantMessageId;
  const assistantStreamGenerationId =
    preparedConversation.assistantMessage.streamGenerationId ?? undefined;
  const createdUserMessage = preparedConversation.createdUserMessage;

  const adapter = getAdapter(providerConfig.providerKind);
  const model = wrapLanguageModel({
    model: adapter.createChatModel(
      providerConfig.runtimeConfig,
      providerConfig.modelId,
    ),
    middleware: extractReasoningMiddleware({ tagName: "think" }),
  });
  const memoryPolicy = version.memoryPolicyJson as {
    enabled?: boolean;
    maxMessages?: number;
  } | null;
  const history = await loadConversationHistory(
    conversation.id,
    { workspaceId: agent.workspaceId, userId: actorUserId },
    {
      summaryEnabled: memoryPolicy?.enabled ?? false,
      maxMessages: memoryPolicy?.maxMessages,
      activeAssistantMessageId: continueFromMessageId
        ? assistantMessage.id
        : undefined,
    },
  );
  const generationHistory = continueFromMessageId
    ? [...history, { role: "user" as const, content }]
    : history;
  const availableAttachments = await loadAuthorizedConversationAttachments({
    conversationId: conversation.id,
    workspaceId: agent.workspaceId,
    userId: actorUserId,
    current: messageAttachments,
  });

  const enqueueEvent = (event: Record<string, unknown>) =>
    publishChatStreamEvent(
      assistantMessage.id,
      event,
      assistantMessage.streamGenerationId ?? undefined,
    );

  const executionContext = {
    requestId,
    agentId,
    actorUserId,
    agent,
    version,
    providerConfig,
    conversation,
    userMessage,
    assistantMessage,
    continuationClaim,
    content,
    history,
    generationHistory,
    availableAttachments,
    useAiSdkUIStream,
    shouldRegenerateConversationTitle,
    capabilityOverrides,
    reasoningEffort,
  };
  if (agent.kind === "orchestrator")
    return {
      response: runOrchestratorChat(executionContext),
      userMessageId,
      assistantMessageId,
      assistantStreamGenerationId,
      createdUserMessage,
    };

  return {
    response: await runStandardChat({
      context: executionContext,
      model,
      messageAttachments,
      createdConversation,
      codeWorkspaceAttachment,
      requestStartedAt,
      enqueueEvent,
    }),
    userMessageId,
    assistantMessageId,
    assistantStreamGenerationId,
    createdUserMessage,
  };
}
