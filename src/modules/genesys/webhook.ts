import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/infrastructure/db";
import {
  genesysConnections,
  genesysDeliveries,
  genesysSessions,
  conversations,
  messages,
  messageParts,
} from "@/server/infrastructure/db/schema";
import { encryptValue } from "@/lib/crypto";
import { readSecrets } from "./connections";
import { verifySignature } from "./client";
import { GenesysError } from "./contracts";
const outbound = z.object({
  id: z.string().min(1).max(256),
  type: z.enum(["Text", "Receipt", "Event"]),
  text: z.string().max(10_000).optional(),
  direction: z.literal("Outbound").optional(),
  channel: z.object({ id: z.string(), to: z.object({ id: z.uuid() }) }),
});
export async function receiveGenesysWebhook(
  connectionId: string,
  body: string,
  signature: string | null,
) {
  const [connection] = await db
    .select()
    .from(genesysConnections)
    .where(eq(genesysConnections.id, connectionId));
  if (
    !connection ||
    !verifySignature(
      body,
      signature,
      (await readSecrets(connection)).webhookSecret,
    )
  )
    throw new GenesysError("GENESYS_INVALID_SIGNATURE", 401);
  let value: z.infer<typeof outbound>;
  try {
    value = outbound.parse(JSON.parse(body));
  } catch {
    throw new GenesysError("GENESYS_INVALID_MESSAGE", 400);
  }
  if (value.channel.id !== connection.integrationId)
    throw new GenesysError("GENESYS_INVALID_INTEGRATION", 400);
  if (value.type !== "Text") return;
  const text = value.text?.trim();
  if (!text) throw new GenesysError("GENESYS_TEXT_ONLY", 422);
  const encryptedText = await encryptValue(`Support Genesys\n\n${text}`);
  const [target] = await db
    .select({ conversationId: genesysSessions.conversationId })
    .from(genesysSessions)
    .where(
      and(
        eq(genesysSessions.id, value.channel.to.id),
        eq(genesysSessions.connectionId, connectionId),
      ),
    );
  if (!target) return;
  await db.transaction(async (tx) => {
    await tx
      .select({ id: conversations.id })
      .from(conversations)
      .where(eq(conversations.id, target.conversationId))
      .for("update");
    const [session] = await tx
      .select()
      .from(genesysSessions)
      .where(
        and(
          eq(genesysSessions.id, value.channel.to.id),
          eq(genesysSessions.connectionId, connectionId),
        ),
      )
      .for("update");
    // A late reply after verified disconnect must never reopen the session.
    if (!session || ["resumed", "completed"].includes(session.state)) return;
    const [conversation] = await tx
      .select({ id: conversations.id })
      .from(conversations)
      .where(
        and(
          eq(conversations.id, session.conversationId),
          eq(conversations.status, "active"),
        ),
      );
    if (!conversation) return;
    const messageId = crypto.randomUUID();
    const [delivery] = await tx
      .insert(genesysDeliveries)
      .values({
        sessionId: session.id,
        messageId,
        externalId: value.id,
        direction: "outbound",
        encryptedText,
        state: "sent",
      })
      .onConflictDoNothing()
      .returning();
    if (!delivery) return;
    await tx.insert(messages).values({
      id: messageId,
      conversationId: session.conversationId,
      role: "assistant",
      status: "completed",
      modelId: "genesys-support",
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
      .where(eq(conversations.id, session.conversationId));
    await tx
      .update(genesysSessions)
      .set({ updatedAt: new Date() })
      .where(
        and(
          eq(genesysSessions.id, session.id),
          ne(genesysSessions.state, "resumed"),
        ),
      );
  });
}
