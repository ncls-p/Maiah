import { and, eq, inArray, lt, ne } from "drizzle-orm";
import { db, withPostgresAdvisoryLock } from "@/server/infrastructure/db";
import {
  genesysConnections,
  genesysDeliveries,
  genesysSessions,
  conversations,
  messages,
} from "@/server/infrastructure/db/schema";
import { decryptValue } from "@/lib/crypto";
import { z } from "zod";
import {
  genesysClient,
  GenesysHttpError,
  inboundMessage,
  remoteState,
} from "./client";
import { projectConnection, readSecrets } from "./connections";

async function processSession(id: string) {
  const [session] = await db
    .select()
    .from(genesysSessions)
    .where(eq(genesysSessions.id, id));
  if (!session || ["resumed", "completed"].includes(session.state)) return;
  const [connection] = await db
    .select()
    .from(genesysConnections)
    .where(eq(genesysConnections.id, session.connectionId));
  if (!connection) return;
  const [conversation] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, session.conversationId));
  if (!conversation || conversation.status !== "active") {
    await db
      .update(genesysSessions)
      .set({ state: "closing" })
      .where(eq(genesysSessions.id, id));
    session.state = "closing";
  }
  const patch = async (values: Partial<typeof genesysSessions.$inferInsert>) =>
    db
      .update(genesysSessions)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(genesysSessions.id, id));
  // A crashed sender may have reached Genesys. Never replay a claimed message.
  await db
    .update(genesysDeliveries)
    .set({ state: "uncertain", updatedAt: new Date() })
    .where(
      and(
        eq(genesysDeliveries.sessionId, id),
        eq(genesysDeliveries.state, "sending"),
        lt(genesysDeliveries.updatedAt, new Date(Date.now() - 120_000)),
      ),
    );
  let client: Awaited<ReturnType<typeof genesysClient>>;
  try {
    client = await genesysClient({
      ...connection,
      ...(await readSecrets(connection)),
    });
  } catch {
    await patch({ errorCode: "GENESYS_CONNECTION_FAILED" });
    return;
  }
  if (session.externalConversationId) {
    try {
      let remote = remoteState(
        await client.conversation(session.externalConversationId),
      );
      if (session.state === "closing" && remote !== "completed") {
        await client.disconnect(session.externalConversationId);
        remote = remoteState(
          await client.conversation(session.externalConversationId),
        );
      }
      if (session.state === "closing") {
        await patch({
          state: remote === "completed" ? "resumed" : "closing",
          errorCode: null,
        });
        return;
      }
      await patch({ state: remote, errorCode: null });
      if (remote === "completed") return;
    } catch {
      await patch({ errorCode: "GENESYS_STATUS_UNAVAILABLE" });
      return;
    }
  } else if (session.state === "closing") {
    const pending = await db
      .select()
      .from(genesysDeliveries)
      .where(
        and(
          eq(genesysDeliveries.sessionId, id),
          inArray(genesysDeliveries.state, ["sending", "sent", "uncertain"]),
        ),
      );
    await patch(
      pending.length
        ? { state: "uncertain", errorCode: "GENESYS_RECONCILIATION_REQUIRED" }
        : { state: "resumed", errorCode: null },
    );
    return;
  }
  const deliveries = await db
    .select()
    .from(genesysDeliveries)
    .where(
      and(
        eq(genesysDeliveries.sessionId, id),
        eq(genesysDeliveries.direction, "inbound"),
      ),
    )
    .orderBy(genesysDeliveries.createdAt, genesysDeliveries.id);
  const blocked = deliveries.find((d) =>
    ["uncertain", "failed", "sending"].includes(d.state),
  );
  if (blocked) {
    await patch({
      state: blocked.state === "failed" ? "failed" : "uncertain",
      errorCode:
        blocked.state === "failed"
          ? "GENESYS_REQUEST_FAILED"
          : "GENESYS_RECONCILIATION_REQUIRED",
    });
    return;
  }
  const next = deliveries.find((d) => d.state === "queued");
  if (!next) return;
  if (!(await projectConnection(session.workspaceId))) {
    await patch({ errorCode: "GENESYS_NOT_AVAILABLE" });
    return;
  }
  const claimed = await db.transaction(async (tx) => {
    const [fresh] = await tx
      .select()
      .from(genesysSessions)
      .where(eq(genesysSessions.id, id))
      .for("update");
    if (!fresh || !["requested", "waiting", "human"].includes(fresh.state))
      return null;
    const [delivery] = await tx
      .update(genesysDeliveries)
      .set({ state: "sending", updatedAt: new Date() })
      .where(
        and(
          eq(genesysDeliveries.id, next.id),
          eq(genesysDeliveries.state, "queued"),
        ),
      )
      .returning();
    return delivery;
  });
  if (!claimed) return;
  try {
    const raw = await client.send(
      inboundMessage(
        id,
        claimed.messageId,
        await decryptValue(claimed.encryptedText),
        claimed.createdAt,
      ),
    );
    const response = z
      .object({ id: z.string().min(1), conversationId: z.uuid().optional() })
      .safeParse(raw);
    if (
      !response.success ||
      (!session.externalConversationId && !response.data.conversationId)
    )
      throw new GenesysHttpError(202, true);
    await db.transaction(async (tx) => {
      await tx
        .update(genesysDeliveries)
        .set({
          state: "sent",
          externalId: response.data.id,
          updatedAt: new Date(),
        })
        .where(eq(genesysDeliveries.id, claimed.id));
      // A simultaneous resume request stays closing until the remote disconnect is verified.
      await tx
        .update(genesysSessions)
        .set({
          externalConversationId:
            response.data.conversationId ?? session.externalConversationId,
          errorCode: null,
          updatedAt: new Date(),
        })
        .where(eq(genesysSessions.id, id));
      await tx
        .update(genesysSessions)
        .set({ state: "waiting" })
        .where(
          and(
            eq(genesysSessions.id, id),
            eq(genesysSessions.state, "requested"),
          ),
        );
    });
  } catch (error) {
    const uncertain = !(error instanceof GenesysHttpError) || error.uncertain;
    await db
      .update(genesysDeliveries)
      .set({ state: uncertain ? "uncertain" : "failed", updatedAt: new Date() })
      .where(eq(genesysDeliveries.id, claimed.id));
    await db
      .update(messages)
      .set({ status: "failed", completedAt: new Date() })
      .where(eq(messages.id, claimed.messageId));
    await patch({
      state: uncertain ? "uncertain" : "failed",
      errorCode: uncertain
        ? "GENESYS_RECONCILIATION_REQUIRED"
        : "GENESYS_REQUEST_FAILED",
    });
  }
}
let running = false;
export async function drainGenesys() {
  if (running) return;
  running = true;
  try {
    const sessions = await db
      .select({ id: genesysSessions.id })
      .from(genesysSessions)
      .where(
        and(
          ne(genesysSessions.state, "resumed"),
          ne(genesysSessions.state, "completed"),
        ),
      )
      .orderBy(genesysSessions.updatedAt)
      .limit(25);
    for (const session of sessions) {
      await withPostgresAdvisoryLock(`genesys-session:${session.id}`, () =>
        processSession(session.id),
      );
    }
  } finally {
    running = false;
  }
}
