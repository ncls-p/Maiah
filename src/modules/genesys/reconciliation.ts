import { and, eq, ne } from "drizzle-orm";
import { db, withPostgresAdvisoryLock } from "@/server/infrastructure/db";
import {
  genesysConnections,
  genesysSessions,
} from "@/server/infrastructure/db/schema";
import { requireConnectionAdmin, readSecrets } from "./connections";
import { genesysClient } from "./client";
import { GenesysError } from "./contracts";
import { audit } from "@/server/domain/services/audit";
export async function listConnectionSessions(organizationId: string) {
  return db
    .select({
      id: genesysSessions.id,
      state: genesysSessions.state,
      errorCode: genesysSessions.errorCode,
      externalConversationId: genesysSessions.externalConversationId,
      updatedAt: genesysSessions.updatedAt,
    })
    .from(genesysSessions)
    .innerJoin(
      genesysConnections,
      eq(genesysConnections.id, genesysSessions.connectionId),
    )
    .where(
      and(
        eq(genesysConnections.organizationId, organizationId),
        ne(genesysSessions.state, "resumed"),
      ),
    )
    .limit(100);
}
// Reconciliation only attaches a remotely verified customer address. It never retries the original send.
export async function reconcileSession(
  userId: string,
  organizationId: string,
  sessionId: string,
  externalConversationId: string,
) {
  await requireConnectionAdmin(userId, organizationId);
  await withPostgresAdvisoryLock(`genesys-session:${sessionId}`, async () => {
    const [row] = await db
      .select({ session: genesysSessions, connection: genesysConnections })
      .from(genesysSessions)
      .innerJoin(
        genesysConnections,
        eq(genesysConnections.id, genesysSessions.connectionId),
      )
      .where(
        and(
          eq(genesysSessions.id, sessionId),
          eq(genesysConnections.organizationId, organizationId),
        ),
      )
      .limit(1);
    if (!row) throw new GenesysError("NOT_FOUND", 404);
    if (row.session.state !== "uncertain" || row.session.externalConversationId)
      throw new GenesysError("GENESYS_RECONCILIATION_NOT_REQUIRED");
    const client = await genesysClient({
      ...row.connection,
      ...(await readSecrets(row.connection)),
    });
    const conversation = await client.conversation(externalConversationId);
    if (
      !conversation.participants.some(
        (p) =>
          ["customer", "external"].includes(p.purpose) &&
          [
            p.address,
            p.fromAddress?.addressRaw,
            p.fromAddress?.addressNormalized,
          ].includes(sessionId),
      )
    )
      throw new GenesysError("GENESYS_CONVERSATION_MISMATCH", 400);
    await db
      .update(genesysSessions)
      .set({
        externalConversationId,
        state: "closing",
        errorCode: null,
        updatedAt: new Date(),
      })
      .where(eq(genesysSessions.id, sessionId));
  });
  await audit.emit({
    actorPrincipalType: "user",
    actorPrincipalId: userId,
    organizationId,
    action: "genesys.session.reconciled",
    resourceType: "organization",
    resourceId: organizationId,
    outcome: "success",
    metadata: { sessionId, externalConversationId },
  });
  return { ok: true };
}
