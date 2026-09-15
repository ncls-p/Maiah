import { and, eq, ne, inArray } from "drizzle-orm";
import { db, withPostgresAdvisoryLock } from "@/server/infrastructure/db";
import {
  conversations,
  genesysSessions,
  genesysDeliveries,
  messages,
} from "@/server/infrastructure/db/schema";
import { GenesysError } from "./contracts";
import { requireHandoffOwner, currentHandoff } from "./sessions";
export async function resumeAi(userId: string, conversationId: string) {
  await requireHandoffOwner(userId, conversationId);
  const current = await currentHandoff(conversationId);
  if (!current) return { ok: true };
  await withPostgresAdvisoryLock(`genesys-session:${current.id}`, () =>
    db.transaction(async (tx) => {
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
            eq(genesysSessions.id, current.id),
            ne(genesysSessions.state, "resumed"),
          ),
        )
        .for("update");
      if (!session) return;
      const deliveries = await tx
        .select()
        .from(genesysDeliveries)
        .where(eq(genesysDeliveries.sessionId, session.id));
      const uncertain = deliveries.some((d) =>
        ["sending", "uncertain"].includes(d.state),
      );
      if (uncertain && !session.externalConversationId)
        throw new GenesysError("GENESYS_RECONCILIATION_REQUIRED");
      const needsDisconnect =
        session.externalConversationId && session.state !== "completed";
      const unsent = deliveries.filter(
        (delivery) =>
          delivery.direction === "inbound" && delivery.state === "queued",
      );
      if (unsent.length)
        await tx
          .update(messages)
          .set({ status: "cancelled", completedAt: new Date() })
          .where(
            inArray(
              messages.id,
              unsent.map((delivery) => delivery.messageId),
            ),
          );
      await tx
        .update(genesysDeliveries)
        .set({ state: "cancelled", updatedAt: new Date() })
        .where(
          and(
            eq(genesysDeliveries.sessionId, session.id),
            eq(genesysDeliveries.state, "queued"),
          ),
        );
      await tx
        .update(genesysSessions)
        .set({
          state: needsDisconnect ? "closing" : "resumed",
          errorCode: null,
          updatedAt: new Date(),
        })
        .where(eq(genesysSessions.id, session.id));
    }),
  );
  return { ok: true };
}
