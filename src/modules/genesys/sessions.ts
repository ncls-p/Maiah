import { audit } from "@/server/domain/services/audit";
import { getOrganizationBuiltInToolPolicyMap } from "@/modules/tool/organization-builtin-tool-policies";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "@/server/infrastructure/db";
import {
  agents,
  agentToolBindings,
  conversations,
  genesysConnections,
  genesysSessions,
  genesysDeliveries,
  messages,
  messageParts,
} from "@/server/infrastructure/db/schema";
import { encryptValue } from "@/lib/crypto";
import { getConversationAccess } from "@/modules/chat/conversation-sharing";
import {
  hasResourcePermissionForRequest,
  isWorkspaceMemberForRequest,
} from "@/modules/auth/workspace-access";
import { projectConnection } from "./connections";
import {
  GenesysError,
  HANDOFF_TOOL,
  handoffInput,
  type GenesysChatState,
} from "./contracts";

export async function currentHandoff(conversationId: string) {
  const [row] = await db
    .select()
    .from(genesysSessions)
    .where(
      and(
        eq(genesysSessions.conversationId, conversationId),
        ne(genesysSessions.state, "resumed"),
      ),
    )
    .limit(1);
  return row ?? null;
}
export async function requireHandoffOwner(
  userId: string,
  conversationId: string,
) {
  const access = await getConversationAccess(conversationId, userId);
  if (!access || access.role !== "owner")
    throw new GenesysError("NOT_FOUND", 404);
  const conversation = access.conversation;
  if (
    !(await isWorkspaceMemberForRequest(
      userId,
      conversation.billingWorkspaceId ?? conversation.workspaceId,
    )) ||
    !(await hasResourcePermissionForRequest(
      userId,
      conversation.workspaceId,
      "agents.chat",
      "agent",
      conversation.agentId,
    ))
  )
    throw new GenesysError("FORBIDDEN", 403);
  return conversation;
}
export async function canRequestHandoff(
  conversation: typeof conversations.$inferSelect,
) {
  if (conversation.isEphemeral) return false;
  const policies = await getOrganizationBuiltInToolPolicyMap(
    conversation.workspaceId,
  );
  if (policies.get(HANDOFF_TOOL.name)?.enabled === false) return false;
  const [agent] = await db
    .select()
    .from(agents)
    .where(eq(agents.id, conversation.agentId))
    .limit(1);
  if (!agent?.activeVersionId || agent.kind !== "assistant") return false;
  const [binding] = await db
    .select()
    .from(agentToolBindings)
    .where(
      and(
        eq(agentToolBindings.agentVersionId, agent.activeVersionId),
        eq(agentToolBindings.toolSource, "builtin"),
        eq(agentToolBindings.toolId, HANDOFF_TOOL.id),
      ),
    )
    .limit(1);
  return Boolean(
    binding &&
    (await projectConnection(
      conversation.billingWorkspaceId ?? conversation.workspaceId,
    )),
  );
}
export async function handoffView(
  userId: string,
  conversationId: string,
): Promise<GenesysChatState> {
  const access = await getConversationAccess(conversationId, userId);
  if (!access) throw new GenesysError("NOT_FOUND", 404);
  // Sharing a transcript grants reading access, never handoff controls.
  if (access.role !== "owner") return { available: false, session: null };
  const conversation = await requireHandoffOwner(userId, conversationId);
  const session = await currentHandoff(conversationId);
  const deliveries = session
    ? await db
        .select({ state: genesysDeliveries.state })
        .from(genesysDeliveries)
        .where(
          and(
            eq(genesysDeliveries.sessionId, session.id),
            eq(genesysDeliveries.direction, "inbound"),
          ),
        )
    : [];
  return {
    available: await canRequestHandoff(conversation),
    session: session
      ? {
          id: session.id,
          state: session.state as NonNullable<
            GenesysChatState["session"]
          >["state"],
          errorCode: session.errorCode,
          updatedAt: session.updatedAt.toISOString(),
          deliveryPending: deliveries.filter((d) =>
            ["queued", "sending"].includes(d.state),
          ).length,
          deliveryFailed: deliveries.filter((d) =>
            ["failed", "uncertain"].includes(d.state),
          ).length,
        }
      : null,
  };
}
export async function requestHandoff(
  userId: string,
  conversationId: string,
  raw: unknown,
  toolMessageId?: string,
) {
  const input = handoffInput.parse(raw);
  const conversation = await requireHandoffOwner(userId, conversationId);
  if (!(await canRequestHandoff(conversation)))
    throw new GenesysError("GENESYS_NOT_AVAILABLE");
  const connection = await projectConnection(
    conversation.billingWorkspaceId ?? conversation.workspaceId,
  );
  if (!connection) throw new GenesysError("GENESYS_NOT_AVAILABLE");
  const encryptedText = await encryptValue(
    `Human support requested\nReason: ${input.reason}\nContext: ${input.summary}`,
  );
  const result = await db.transaction(async (tx) => {
    // Same organization lock as connection edits: credentials/grants cannot change mid-admission.
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`genesys-org:${connection.organizationId}`}, 0))`,
    );
    const [fresh] = await tx
      .select()
      .from(genesysConnections)
      .where(eq(genesysConnections.id, connection.id));
    if (
      !fresh?.enabled ||
      !fresh.validatedAt ||
      fresh.updatedAt.getTime() !== connection.updatedAt.getTime()
    )
      throw new GenesysError("GENESYS_NOT_AVAILABLE");
    await tx
      .select({ id: conversations.id })
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .for("update");
    const [existing] = await tx
      .select()
      .from(genesysSessions)
      .where(
        and(
          eq(genesysSessions.conversationId, conversationId),
          ne(genesysSessions.state, "resumed"),
        ),
      );
    if (existing) return { accepted: true, handoffId: existing.id };
    const running = await tx
      .select({ id: messages.id })
      .from(messages)
      .where(
        and(
          eq(messages.conversationId, conversationId),
          eq(messages.role, "assistant"),
          inArray(messages.status, ["pending", "streaming"]),
        ),
      );
    if (running.some((m) => m.id !== toolMessageId))
      throw new GenesysError("GENESYS_STOP_AI_FIRST");
    if (toolMessageId && !running.some((m) => m.id === toolMessageId))
      throw new GenesysError("GENESYS_INTERACTIVE_ONLY");
    const [session] = await tx
      .insert(genesysSessions)
      .values({
        connectionId: connection.id,
        conversationId,
        workspaceId:
          conversation.billingWorkspaceId ?? conversation.workspaceId,
        userId,
      })
      .returning();
    await tx.insert(genesysDeliveries).values({
      sessionId: session.id,
      messageId: crypto.randomUUID(),
      direction: "inbound",
      encryptedText,
    });
    return { accepted: true, handoffId: session.id };
  });
  await audit.emit({
    actorPrincipalType: "user",
    actorPrincipalId: userId,
    workspaceId: conversation.workspaceId,
    action: "genesys.handoff.requested",
    resourceType: "conversation",
    resourceId: conversationId,
    outcome: "success",
    metadata: { handoffId: result.handoffId },
  });
  return result;
}
export async function sendHumanMessage(
  userId: string,
  conversationId: string,
  messageId: string,
  text: string,
) {
  await requireHandoffOwner(userId, conversationId);
  const encryptedText = await encryptValue(text);
  return db.transaction(async (tx) => {
    await tx
      .select({ id: conversations.id })
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .for("update");
    const [session] = await tx
      .select()
      .from(genesysSessions)
      .where(
        and(
          eq(genesysSessions.conversationId, conversationId),
          ne(genesysSessions.state, "resumed"),
        ),
      )
      .for("update");
    if (!session || !["requested", "waiting", "human"].includes(session.state))
      throw new GenesysError("GENESYS_NOT_ACCEPTING_MESSAGES");
    if (!(await projectConnection(session.workspaceId)))
      throw new GenesysError("GENESYS_NOT_AVAILABLE");
    const [delivery] = await tx
      .insert(genesysDeliveries)
      .values({
        sessionId: session.id,
        messageId,
        direction: "inbound",
        encryptedText,
      })
      .onConflictDoNothing()
      .returning();
    if (!delivery) return { ok: true };
    await tx.insert(messages).values({
      id: messageId,
      conversationId,
      role: "user",
      status: "completed",
      completedAt: new Date(),
    });
    await tx.insert(messageParts).values({
      messageId,
      type: "text",
      contentEncrypted: encryptedText,
      sortOrder: 0,
    });
    await tx
      .update(conversations)
      .set({ updatedAt: new Date() })
      .where(eq(conversations.id, conversationId));
    await tx
      .update(genesysSessions)
      .set({ updatedAt: new Date() })
      .where(eq(genesysSessions.id, session.id));
    return { ok: true };
  });
}
export { resumeAi } from "./lifecycle";
