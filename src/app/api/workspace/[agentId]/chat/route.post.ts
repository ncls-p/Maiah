import { logger, logHandledError } from "@/lib/logger";
import { requireResourcePermissionAsync } from "@/lib/route-handler";
import { canUseAgent } from "@/modules/agent/use-cases";
import { runWithRequestAuth } from "@/modules/auth/request-auth-context";
import { getActorUserId, resolveAuthContext } from "@/modules/auth/resolve-auth";
import { getChatAttachment, publicChatAttachment, type ChatAttachment } from "@/modules/chat/attachments";
import { publishChatStreamEvent } from "@/modules/chat/stream-bus";
import { codeWorkspaceArtifact, getCodeWorkspace } from "@/modules/code-workspace/storage";
import { assertWorkspaceWithinTokenQuota } from "@/modules/usage/quota";
import { db } from "@/server/infrastructure/db";
import { agents, messages } from "@/server/infrastructure/db/schema";
import { getAdapter } from "@/server/infrastructure/providers";
import { extractReasoningMiddleware, wrapLanguageModel } from "ai";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { loadConversationHistory } from "./route-history";
import { chatRequestSchema } from "./route-support";
import { runOrchestratorChat } from "./route.orchestrator";
import { prepareChatConversation } from "./route.prepare-conversation";
import { runStandardChat } from "./route.standard";

export async function POST(req: NextRequest, { params }: { params: Promise<{ agentId: string }> }) {
  const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();
  const requestStartedAt = Date.now();
  const jsonResponse = (body: unknown, status: number) =>
    NextResponse.json(body, {
      status,
      headers: { "x-request-id": requestId },
    });
  const rejectChatRequest = (status: number, reason: string, body: unknown, context: Record<string, unknown> = {}) => {
    logger.warn("Chat request rejected", {
      requestId,
      status,
      reason,
      durationMs: Date.now() - requestStartedAt,
      ...context,
    });
    return jsonResponse(body, status);
  };
  let userMessageId: string | undefined;
  let assistantMessageId: string | undefined;

  try {
    const auth = await resolveAuthContext();
    if (!auth) {
      return rejectChatRequest(401, "no_session", { error: "Unauthorized" });
    }
    const actorUserId = getActorUserId(auth);

    const { agentId } = await params;
    const parsed = chatRequestSchema.safeParse(await req.json());
    if (!parsed.success) {
      return rejectChatRequest(400, "invalid_input", { error: "Invalid input", details: parsed.error.issues }, { agentId, userId: actorUserId, issues: parsed.error.issues.length });
    }

    const {
      content,
      conversationId: existingConversationId,
      resendFromMessageId,
      continueFromMessageId,
      codeWorkspaceId,
      attachmentIds = [],
      imageAttachmentIds = [],
      capabilityOverrides,
    } = parsed.data;
    const streamProtocol = req.headers.get("X-AI-Hub-Stream-Protocol") ?? req.nextUrl.searchParams.get("streamProtocol");
    const useAiSdkUIStream = streamProtocol === "ai-sdk-ui";
    if (resendFromMessageId && continueFromMessageId) {
      return rejectChatRequest(400, "conflicting_message_actions", { error: "Cannot regenerate and continue a response together" }, { agentId, userId: actorUserId });
    }
    if (continueFromMessageId && (codeWorkspaceId || attachmentIds.length > 0 || imageAttachmentIds.length > 0)) {
      return rejectChatRequest(400, "continuation_with_attachments", { error: "Response continuation does not accept new attachments" }, { agentId, userId: actorUserId, continueFromMessageId });
    }

    const [agent] = await db.select().from(agents).where(eq(agents.id, agentId)).limit(1);

    if (!agent) {
      return rejectChatRequest(404, "agent_not_found", { error: "Agent not found" }, { agentId, userId: actorUserId });
    }
    if (!canUseAgent(agent, actorUserId)) {
      return rejectChatRequest(404, "agent_not_available_for_user", { error: "Agent not found" }, { agentId, userId: actorUserId, workspaceId: agent.workspaceId });
    }
    if (auth.type === "api_key" && auth.workspaceId !== agent.workspaceId) {
      return rejectChatRequest(403, "api_key_workspace_mismatch", { error: "Forbidden" }, { agentId, userId: actorUserId, workspaceId: agent.workspaceId });
    }

    const forbidden = await runWithRequestAuth(auth, () => requireResourcePermissionAsync(actorUserId, agent.workspaceId, "agents.chat", "agent", agentId));
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

    let codeWorkspaceAttachment: ReturnType<typeof codeWorkspaceArtifact> | null = null;
    const messageAttachments: ChatAttachment[] = [];
    if (codeWorkspaceId) {
      const metadata = await getCodeWorkspace(codeWorkspaceId);
      if (metadata.workspaceId !== agent.workspaceId || metadata.createdByUserId !== actorUserId) {
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
      codeWorkspaceAttachment = codeWorkspaceArtifact(metadata, "Uploaded ZIP workspace.");
    }
    const requestedAttachmentIds = Array.from(new Set([...attachmentIds, ...imageAttachmentIds]));
    for (const attachmentId of requestedAttachmentIds) {
      const metadata = await getChatAttachment(attachmentId);
      if (metadata.workspaceId !== agent.workspaceId || metadata.createdByUserId !== actorUserId) {
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

    const preparedConversation = await prepareChatConversation({
      agent,
      actorUserId,
      agentId,
      content,
      existingConversationId,
      resendFromMessageId,
      continueFromMessageId,
      codeWorkspaceAttachment,
      messageAttachments,
      rejectChatRequest,
    });
    if (preparedConversation instanceof Response) return preparedConversation;
    const { conversation, createdConversation, version, providerConfig, continuationClaim, userMessage, assistantMessage, shouldRegenerateConversationTitle } = preparedConversation;
    userMessageId = preparedConversation.userMessageId;
    assistantMessageId = preparedConversation.assistantMessageId;

    const adapter = getAdapter(providerConfig.providerKind);
    const model = wrapLanguageModel({
      model: adapter.createChatModel(providerConfig.runtimeConfig, providerConfig.modelId),
      middleware: extractReasoningMiddleware({ tagName: "think" }),
    });
    const memoryPolicy = version.memoryPolicyJson as {
      enabled?: boolean;
      summaryThresholdTokens?: number;
    } | null;
    const history = await loadConversationHistory(conversation.id, { workspaceId: agent.workspaceId, userId: actorUserId }, memoryPolicy?.enabled ?? false);
    const generationHistory = continueFromMessageId ? [...history, { role: "user" as const, content }] : history;

    const enqueueEvent = (event: Record<string, unknown>) => publishChatStreamEvent(assistantMessage.id, event);

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
      useAiSdkUIStream,
      shouldRegenerateConversationTitle,
      capabilityOverrides,
    };
    if (agent.kind === "orchestrator") return runOrchestratorChat(executionContext);

    return runStandardChat({
      context: executionContext,
      model,
      messageAttachments,
      createdConversation,
      codeWorkspaceAttachment,
      requestStartedAt,
      enqueueEvent,
    });
  } catch (error) {
    // Chat request failed — messages marked failed below

    if (assistantMessageId) {
      await db.update(messages).set({ status: "failed", completedAt: new Date() }).where(eq(messages.id, assistantMessageId));
    }
    if (userMessageId) {
      await db.update(messages).set({ status: "failed", completedAt: new Date() }).where(eq(messages.id, userMessageId));
    }

    logHandledError(
      "Chat request failed",
      {
        requestId,
        status: 500,
        userMessageId,
        assistantMessageId,
        durationMs: Date.now() - requestStartedAt,
      },
      error as Error,
    );

    return jsonResponse(
      {
        error: "Internal server error",
        ...(process.env.NODE_ENV !== "production" && error instanceof Error ? { detail: error.message } : {}),
      },
      500,
    );
  }
}
