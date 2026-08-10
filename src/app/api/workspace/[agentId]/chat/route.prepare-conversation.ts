import { encryptValue } from "@/lib/crypto";
import { getActiveVersion, resolveProviderForVersion } from "@/modules/agent/use-cases";
import type { AssistantContinuationClaim } from "@/modules/chat/continuation";
import { claimAssistantContinuation } from "@/modules/chat/continuation";
import type { ChatAttachment } from "@/modules/chat/attachments";
import { forkSharedConversation, getConversationAccess } from "@/modules/chat/conversation-sharing";
import { db } from "@/server/infrastructure/db";
import { conversations, messageParts, messages, toolInvocations } from "@/server/infrastructure/db/schema";
import { and, eq, gt, inArray, ne } from "drizzle-orm";

import { findUserMessageForResend, isFirstUserMessageInConversation, mergeUserFilePartMetadata } from "./route-support";
import type { ChatAgentRow } from "./route.execution-context";

type RejectRequest = (status: number, reason: string, body: unknown, context?: Record<string, unknown>) => Response;

export async function prepareChatConversation(input: { agent: ChatAgentRow; actorUserId: string; agentId: string; content: string; existingConversationId?: string | null; ephemeral?: boolean; resendFromMessageId?: string | null; continueFromMessageId?: string | null; codeWorkspaceAttachment: unknown; messageAttachments: ChatAttachment[]; rejectChatRequest: RejectRequest }) {
  const { agent, actorUserId, agentId, content, existingConversationId, ephemeral = false, resendFromMessageId, continueFromMessageId, codeWorkspaceAttachment, messageAttachments, rejectChatRequest } = input;
  let conversation: typeof conversations.$inferSelect | null = null;
  let createdConversation = false;
  if (existingConversationId) {
    const access = await getConversationAccess(existingConversationId, actorUserId);
    const existing = access?.conversation;
    if (existing && existing.workspaceId === agent.workspaceId && existing.agentId === agentId && (!existing.expiresAt || existing.expiresAt > new Date())) {
      if (access.role === "recipient") {
        if (!access.canContinue || resendFromMessageId || continueFromMessageId) {
          return rejectChatRequest(403, "conversation_read_only", {
            error: "This shared conversation is read-only",
          });
        }
        conversation = access.continuationMode === "fork" ? await forkSharedConversation(existing, actorUserId) : existing;
        createdConversation = access.continuationMode === "fork";
      } else {
        conversation = existing;
      }
    }

    if (!conversation && (resendFromMessageId || continueFromMessageId)) {
      return rejectChatRequest(
        404,
        "conversation_not_found",
        { error: "Conversation not found" },
        {
          agentId,
          workspaceId: agent.workspaceId,
          userId: actorUserId,
          conversationId: existingConversationId,
          resendFromMessageId,
          continueFromMessageId,
        },
      );
    }
  }

  if (!conversation && (resendFromMessageId || continueFromMessageId)) {
    return rejectChatRequest(
      400,
      "message_action_without_conversation",
      { error: "Cannot modify a response without an existing conversation" },
      {
        agentId,
        workspaceId: agent.workspaceId,
        userId: actorUserId,
        resendFromMessageId,
        continueFromMessageId,
      },
    );
  }

  const version = await getActiveVersion(agentId);

  if (!version) {
    return rejectChatRequest(400, "no_active_agent_version", { error: "No active agent version configured" }, { agentId, workspaceId: agent.workspaceId, userId: actorUserId });
  }

  const providerConfig = await resolveProviderForVersion(version);
  if (!providerConfig || !providerConfig.modelId) {
    return rejectChatRequest(
      400,
      "no_provider_model",
      { error: "No provider model configured for this agent version" },
      {
        agentId,
        workspaceId: agent.workspaceId,
        userId: actorUserId,
        agentVersionId: version.id,
      },
    );
  }

  if (!conversation) {
    const [newConversation] = await db
      .insert(conversations)
      .values({
        workspaceId: agent.workspaceId,
        agentId,
        agentVersionId: version.id,
        userId: actorUserId,
        title: content.slice(0, 100),
        status: "active",
        isEphemeral: ephemeral,
        expiresAt: ephemeral ? new Date(Date.now() + 24 * 60 * 60 * 1000) : null,
      })
      .returning();
    conversation = newConversation;
    createdConversation = true;
  }

  // Existing conversations can reference archived/deleted versions; fail safely.
  if (version.agentId !== agentId) {
    return rejectChatRequest(
      400,
      "invalid_conversation_version",
      { error: "Invalid conversation version" },
      {
        agentId,
        workspaceId: agent.workspaceId,
        userId: actorUserId,
        agentVersionId: version.id,
        conversationId: conversation.id,
      },
    );
  }

  let continuationClaim: Extract<AssistantContinuationClaim, { status: "claimed" }> | null = null;
  if (continueFromMessageId) {
    const claim = await claimAssistantContinuation({
      conversationId: conversation.id,
      messageId: continueFromMessageId,
      providerId: providerConfig.providerId,
      modelId: providerConfig.modelId,
    });
    if (claim.status !== "claimed") {
      const status = claim.status === "already_streaming" ? 409 : 404;
      return rejectChatRequest(
        status,
        `continuation_${claim.status}`,
        {
          error: claim.status === "already_streaming" ? "This response is already streaming" : "Only the latest assistant response can be continued",
        },
        {
          agentId,
          workspaceId: agent.workspaceId,
          userId: actorUserId,
          conversationId: conversation.id,
          continueFromMessageId,
        },
      );
    }
    continuationClaim = claim;
  }

  let userMessage: typeof messages.$inferSelect | null = null;
  if (continueFromMessageId) {
    // The continuation prompt is model-only context. It must never become a
    // visible or persisted user message.
  } else if (resendFromMessageId) {
    const existingUserMessage = await findUserMessageForResend({
      conversationId: conversation.id,
      messageId: resendFromMessageId,
      content,
    });

    if (!existingUserMessage) {
      return rejectChatRequest(
        404,
        "message_not_found_for_resend",
        { error: "Message not found" },
        {
          agentId,
          workspaceId: agent.workspaceId,
          userId: actorUserId,
          conversationId: conversation.id,
          resendFromMessageId,
        },
      );
    }

    const encryptedContent = await encryptValue(content);
    await db.transaction(async (tx) => {
      const existingFileParts = await tx
        .select({ metadataJson: messageParts.metadataJson })
        .from(messageParts)
        .where(and(eq(messageParts.messageId, existingUserMessage.id), eq(messageParts.type, "file")))
        .orderBy(messageParts.sortOrder);
      const messagesToReplace = await tx
        .select({ id: messages.id })
        .from(messages)
        .where(and(eq(messages.conversationId, conversation.id), ne(messages.id, existingUserMessage.id), gt(messages.createdAt, existingUserMessage.createdAt)));
      const messageIdsToReplace = messagesToReplace.map((message) => message.id);
      if (messageIdsToReplace.length > 0) {
        await tx.delete(toolInvocations).where(inArray(toolInvocations.messageId, messageIdsToReplace));
        await tx.delete(messages).where(inArray(messages.id, messageIdsToReplace));
      }
      await tx.delete(messageParts).where(eq(messageParts.messageId, existingUserMessage.id));
      await tx.insert(messageParts).values({
        messageId: existingUserMessage.id,
        type: "text",
        contentEncrypted: encryptedContent,
        sortOrder: 0,
      });
      const requestedFileParts = [...(codeWorkspaceAttachment ? [codeWorkspaceAttachment] : []), ...messageAttachments];
      const userFileParts = mergeUserFilePartMetadata(
        existingFileParts.map((part) => part.metadataJson),
        requestedFileParts,
      );
      for (const [index, metadata] of userFileParts.entries()) {
        await tx.insert(messageParts).values({
          messageId: existingUserMessage.id,
          type: "file",
          metadataJson: metadata,
          sortOrder: index + 1,
        });
      }
    });
    userMessage = existingUserMessage;
  } else {
    const encryptedContent = await encryptValue(content);
    const [newUserMessage] = await db
      .insert(messages)
      .values({
        conversationId: conversation.id,
        role: "user",
        status: "completed",
        completedAt: new Date(),
      })
      .returning();
    userMessage = newUserMessage;

    await db.insert(messageParts).values({
      messageId: newUserMessage.id,
      type: "text",
      contentEncrypted: encryptedContent,
      sortOrder: 0,
    });
    const chatAttachments = messageAttachments;
    const userFileParts = [...(codeWorkspaceAttachment ? [codeWorkspaceAttachment] : []), ...chatAttachments];
    for (const [index, metadata] of userFileParts.entries()) {
      await db.insert(messageParts).values({
        messageId: newUserMessage.id,
        type: "file",
        metadataJson: metadata,
        sortOrder: index + 1,
      });
    }
  }
  const userMessageId = userMessage?.id;
  await db.update(conversations).set({ updatedAt: new Date(), sidebarOrder: null }).where(eq(conversations.id, conversation.id));
  const shouldRegenerateConversationTitle = createdConversation || (!continueFromMessageId && resendFromMessageId ? await isFirstUserMessageInConversation(conversation.id, userMessage!.id) : false);

  const assistantMessage = continuationClaim
    ? continuationClaim.message
    : (
        await db
          .insert(messages)
          .values({
            conversationId: conversation.id,
            role: "assistant",
            status: "streaming",
            modelId: providerConfig.modelId,
            providerId: providerConfig.providerId,
          })
          .returning()
      )[0];
  const assistantMessageId = assistantMessage.id;

  return {
    conversation,
    createdConversation,
    version,
    providerConfig,
    continuationClaim,
    userMessage,
    assistantMessage,
    shouldRegenerateConversationTitle,
    userMessageId,
    assistantMessageId,
  };
}
