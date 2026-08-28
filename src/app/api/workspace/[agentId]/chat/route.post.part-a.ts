import { logger } from "@/lib/logger";
import {
  requireResourcePermissionAsync,
  requireWorkspacePermissionAsync,
} from "@/lib/route-handler";
import { canUseAgent } from "@/modules/agent/use-cases";
import { runWithRequestAuth } from "@/modules/auth/request-auth-context";
import {
  getActorUserId,
  resolveAuthContext,
} from "@/modules/auth/resolve-auth";
import {
  getChatAttachment,
  publicChatAttachment,
  type ChatAttachment,
} from "@/modules/chat/attachments";
import { getConversationAccess } from "@/modules/chat/conversation-sharing";
import {
  codeWorkspaceArtifact,
  getCodeWorkspace,
} from "@/modules/code-workspace/storage";
import { assertWorkspaceWithinTokenQuota } from "@/modules/usage/quota";
import { db } from "@/server/infrastructure/db";
import { authorization } from "@/server/domain/services/authorization";
import { agents } from "@/server/infrastructure/db/schema";
import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { chatRequestSchema } from "./route-support";

type ChatRequestData = z.infer<typeof chatRequestSchema>;

export type ValidatedChatRequest = {
  agent: typeof agents.$inferSelect;
  actorUserId: string;
  content: string;
  existingConversationId: string | null | undefined;
  ephemeral: boolean;
  ephemeralTtlMinutes: number | undefined;
  resendFromMessageId: string | null | undefined;
  regenerateAssistantMessageId: string | null | undefined;
  continueFromMessageId: string | null | undefined;
  capabilityOverrides: ChatRequestData["capabilityOverrides"];
  reasoningEffort: ChatRequestData["reasoningEffort"];
  useAiSdkUIStream: boolean;
  codeWorkspaceAttachment: ReturnType<typeof codeWorkspaceArtifact> | null;
  messageAttachments: ChatAttachment[];
};

export async function validateChatRequest(input: {
  req: NextRequest;
  agentId: string;
  requestId: string;
  requestStartedAt: number;
  rejectChatRequest: (
    status: number,
    reason: string,
    body: unknown,
    context?: Record<string, unknown>,
  ) => Response;
}): Promise<Response | ValidatedChatRequest> {
  const { req, agentId, requestId, requestStartedAt, rejectChatRequest } =
    input;
  const auth = await resolveAuthContext();
  if (!auth) {
    return rejectChatRequest(401, "no_session", { error: "Unauthorized" });
  }
  const actorUserId = getActorUserId(auth);

  const parsed = chatRequestSchema.safeParse(await req.json());
  if (!parsed.success) {
    return rejectChatRequest(
      400,
      "invalid_input",
      { error: "Invalid input", details: parsed.error.issues },
      { agentId, userId: actorUserId, issues: parsed.error.issues.length },
    );
  }

  const {
    content,
    conversationId: existingConversationId,
    ephemeral = false,
    ephemeralTtlMinutes,
    resendFromMessageId,
    regenerateAssistantMessageId,
    continueFromMessageId,
    codeWorkspaceId,
    attachmentIds = [],
    imageAttachmentIds = [],
    capabilityOverrides,
    reasoningEffort,
  } = parsed.data;
  const streamProtocol =
    req.headers.get("X-AI-Hub-Stream-Protocol") ??
    req.nextUrl.searchParams.get("streamProtocol");
  const useAiSdkUIStream = streamProtocol === "ai-sdk-ui";
  if (resendFromMessageId && continueFromMessageId) {
    return rejectChatRequest(
      400,
      "conflicting_message_actions",
      { error: "Cannot regenerate and continue a response together" },
      { agentId, userId: actorUserId },
    );
  }
  if (regenerateAssistantMessageId && !resendFromMessageId) {
    return rejectChatRequest(
      400,
      "regeneration_without_prompt",
      { error: "Regeneration requires its user prompt" },
      { agentId, userId: actorUserId },
    );
  }
  if (
    continueFromMessageId &&
    (codeWorkspaceId ||
      attachmentIds.length > 0 ||
      imageAttachmentIds.length > 0)
  ) {
    return rejectChatRequest(
      400,
      "continuation_with_attachments",
      { error: "Response continuation does not accept new attachments" },
      { agentId, userId: actorUserId, continueFromMessageId },
    );
  }

  const [agent] = await db
    .select()
    .from(agents)
    .where(eq(agents.id, agentId))
    .limit(1);

  if (!agent) {
    return rejectChatRequest(
      404,
      "agent_not_found",
      { error: "Agent not found" },
      { agentId, userId: actorUserId },
    );
  }
  const conversationAccess = existingConversationId
    ? await getConversationAccess(existingConversationId, actorUserId)
    : null;
  const canContinueSharedConversation = Boolean(
    conversationAccess?.role === "recipient" &&
      conversationAccess.canContinue &&
      conversationAccess.conversation.agentId === agentId,
  );
  const directlyShared = await authorization.hasDirectPermission(
    { principalType: "user", principalId: actorUserId },
    "agents.get",
    "agent",
    agent.id,
    agent.workspaceId,
  );
  if (
    !canUseAgent(agent, actorUserId) &&
    !directlyShared &&
    !canContinueSharedConversation
  ) {
    return rejectChatRequest(
      404,
      "agent_not_available_for_user",
      { error: "Agent not found" },
      { agentId, userId: actorUserId, workspaceId: agent.workspaceId },
    );
  }
  if (auth.type === "api_key" && auth.workspaceId !== agent.workspaceId) {
    return rejectChatRequest(
      403,
      "api_key_workspace_mismatch",
      { error: "Forbidden" },
      { agentId, userId: actorUserId, workspaceId: agent.workspaceId },
    );
  }

  const forbidden = await runWithRequestAuth(auth, () =>
    canContinueSharedConversation
      ? requireWorkspacePermissionAsync(
          actorUserId,
          agent.workspaceId,
          "agents.chat",
        )
      : requireResourcePermissionAsync(
          actorUserId,
          agent.workspaceId,
          "agents.chat",
          "agent",
          agentId,
        ),
  );
  if (forbidden) {
    logger.warn("Chat request rejected", {
      requestId,
      status: forbidden.status,
      reason: "missing_workspace_permission",
      agentId,
      workspaceId: agent.workspaceId,
      userId: actorUserId,
      durationMs: Date.now() - requestStartedAt,
    });
    forbidden.headers.set("x-request-id", requestId);
    return forbidden;
  }

  const quota = await assertWorkspaceWithinTokenQuota(agent.workspaceId);
  if (!quota.allowed) {
    return rejectChatRequest(
      429,
      "quota_exceeded",
      {
        error: quota.message,
        code: "quota_exceeded",
        used: quota.used,
        limit: quota.limit,
      },
      { agentId, workspaceId: agent.workspaceId, userId: actorUserId },
    );
  }

  let codeWorkspaceAttachment: ReturnType<
    typeof codeWorkspaceArtifact
  > | null = null;
  const messageAttachments: ChatAttachment[] = [];
  if (codeWorkspaceId) {
    const metadata = await getCodeWorkspace(codeWorkspaceId);
    if (
      metadata.workspaceId !== agent.workspaceId ||
      metadata.createdByUserId !== actorUserId
    ) {
      return rejectChatRequest(
        404,
        "code_workspace_not_found",
        { error: "Code workspace not found" },
        {
          agentId,
          workspaceId: agent.workspaceId,
          userId: actorUserId,
          codeWorkspaceId,
        },
      );
    }
    codeWorkspaceAttachment = codeWorkspaceArtifact(
      metadata,
      "Uploaded ZIP workspace.",
    );
  }
  const requestedAttachmentIds = Array.from(
    new Set([...attachmentIds, ...imageAttachmentIds]),
  );
  for (const attachmentId of requestedAttachmentIds) {
    const metadata = await getChatAttachment(attachmentId);
    if (
      metadata.workspaceId !== agent.workspaceId ||
      metadata.createdByUserId !== actorUserId
    ) {
      return rejectChatRequest(
        404,
        "attachment_not_found",
        { error: "Attachment not found" },
        {
          agentId,
          workspaceId: agent.workspaceId,
          userId: actorUserId,
          attachmentId,
        },
      );
    }
    messageAttachments.push(publicChatAttachment(metadata));
  }

  return {
    agent,
    actorUserId,
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
  };
}