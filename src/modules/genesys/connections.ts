import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/infrastructure/db";
import {
  genesysConnections,
  genesysProjects,
  genesysSessions,
  workspaces,
} from "@/server/infrastructure/db/schema";
import { encryptValue, decryptValue } from "@/lib/crypto";
import { authorization } from "@/server/domain/services/authorization";
import { audit } from "@/server/domain/services/audit";
import { GenesysError, connectionInput } from "./contracts";
import { genesysClient } from "./client";
const secretsSchema = z.object({
  clientSecret: z.string(),
  webhookSecret: z.string(),
});
export const readSecrets = async (
  row: typeof genesysConnections.$inferSelect,
) => secretsSchema.parse(JSON.parse(await decryptValue(row.encryptedSecrets)));
export async function requireConnectionAdmin(
  userId: string,
  organizationId: string,
) {
  if (
    !(await authorization.hasPermission(
      { principalType: "user", principalId: userId },
      "organization.update",
      "organization",
      organizationId,
    ))
  )
    throw new GenesysError("FORBIDDEN", 403);
}
export async function getOrganizationConnection(organizationId: string) {
  const [row] = await db
    .select()
    .from(genesysConnections)
    .where(eq(genesysConnections.organizationId, organizationId))
    .limit(1);
  return row ?? null;
}
export async function connectionView(organizationId: string) {
  const row = await getOrganizationConnection(organizationId);
  if (!row) return null;
  const grants = await db
    .select()
    .from(genesysProjects)
    .where(eq(genesysProjects.connectionId, row.id));
  const { encryptedSecrets: _, ...safe } = row;
  void _;
  return {
    ...safe,
    projectIds: grants.map((g) => g.workspaceId),
    hasSecrets: true,
  };
}
export async function saveConnection(
  userId: string,
  organizationId: string,
  raw: unknown,
) {
  await requireConnectionAdmin(userId, organizationId);
  const input = connectionInput.parse(raw);
  await db.transaction(async (tx) => {
    // Serialize saves for a new or existing organization connection.
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`genesys-org:${organizationId}`}, 0))`,
    );
    const [old] = await tx
      .select()
      .from(genesysConnections)
      .where(eq(genesysConnections.organizationId, organizationId));
    if (old) {
      const [active] = await tx
        .select({ id: genesysSessions.id })
        .from(genesysSessions)
        .where(
          and(
            eq(genesysSessions.connectionId, old.id),
            ne(genesysSessions.state, "resumed"),
          ),
        )
        .limit(1);
      if (active) {
        const grants = await tx
          .select()
          .from(genesysProjects)
          .where(eq(genesysProjects.connectionId, old.id));
        if (
          input.region !== old.region ||
          input.integrationId !== old.integrationId ||
          input.projectIds.length !== grants.length ||
          grants.some((grant) => !input.projectIds.includes(grant.workspaceId))
        )
          throw new GenesysError("GENESYS_CONNECTION_IN_USE");
      }
    }
    const projects = input.projectIds.length
      ? await tx
          .select()
          .from(workspaces)
          .where(inArray(workspaces.id, input.projectIds))
      : [];
    if (
      projects.length !== new Set(input.projectIds).size ||
      projects.some((p) => p.organizationId !== organizationId)
    )
      throw new GenesysError("GENESYS_PROJECT_FORBIDDEN", 403);
    const previous = old ? await readSecrets(old) : null;
    const secrets = {
      clientSecret: input.clientSecret ?? previous?.clientSecret,
      webhookSecret: input.webhookSecret ?? previous?.webhookSecret,
    };
    if (!secrets.clientSecret || !secrets.webhookSecret)
      throw new GenesysError("GENESYS_SECRETS_REQUIRED", 400);
    const values = {
      organizationId,
      label: input.label,
      region: input.region,
      clientId: input.clientId,
      integrationId: input.integrationId,
      enabled: input.enabled,
      encryptedSecrets: await encryptValue(JSON.stringify(secrets)),
      validatedAt: null,
      validationError: null,
      updatedAt: new Date(),
    };
    const [row] = old
      ? await tx
          .update(genesysConnections)
          .set(values)
          .where(eq(genesysConnections.id, old.id))
          .returning()
      : await tx.insert(genesysConnections).values(values).returning();
    await tx
      .delete(genesysProjects)
      .where(eq(genesysProjects.connectionId, row.id));
    if (projects.length)
      await tx
        .insert(genesysProjects)
        .values(
          projects.map((p) => ({ workspaceId: p.id, connectionId: row.id })),
        );
  });
  await audit.emit({
    actorPrincipalType: "user",
    actorPrincipalId: userId,
    organizationId,
    action: "genesys.connection.updated",
    resourceType: "organization",
    resourceId: organizationId,
    outcome: "success",
  });
  return connectionView(organizationId);
}
export async function testConnection(
  userId: string,
  organizationId: string,
  webhookUrl: string,
) {
  await requireConnectionAdmin(userId, organizationId);
  const row = await getOrganizationConnection(organizationId);
  if (!row) throw new GenesysError("GENESYS_NOT_CONFIGURED", 404);
  let errorCode: string | null = null;
  try {
    const secret = await readSecrets(row);
    const client = await genesysClient({ ...row, ...secret });
    const integration = z
      .object({
        id: z.string(),
        outboundNotificationWebhookUrl: z.string(),
        outboundNotificationWebhookSignatureSecretToken: z.string(),
      })
      .parse(await client.integration());
    if (
      integration.id !== row.integrationId ||
      integration.outboundNotificationWebhookUrl !== webhookUrl ||
      integration.outboundNotificationWebhookSignatureSecretToken !==
        secret.webhookSecret
    )
      errorCode = "GENESYS_WEBHOOK_MISMATCH";
  } catch {
    errorCode = "GENESYS_CONNECTION_TEST_FAILED";
  }
  await db
    .update(genesysConnections)
    .set({
      validatedAt: errorCode ? null : new Date(),
      validationError: errorCode,
    })
    .where(
      and(
        eq(genesysConnections.id, row.id),
        eq(genesysConnections.updatedAt, row.updatedAt),
      ),
    );
  return { ok: !errorCode, errorCode };
}
export async function projectConnection(workspaceId: string) {
  const [result] = await db
    .select({ connection: genesysConnections })
    .from(genesysProjects)
    .innerJoin(
      genesysConnections,
      eq(genesysConnections.id, genesysProjects.connectionId),
    )
    .innerJoin(
      workspaces,
      and(
        eq(workspaces.id, genesysProjects.workspaceId),
        eq(workspaces.organizationId, genesysConnections.organizationId),
      ),
    )
    .where(
      and(
        eq(genesysProjects.workspaceId, workspaceId),
        eq(genesysConnections.enabled, true),
      ),
    )
    .limit(1);
  return result?.connection?.validatedAt ? result.connection : null;
}
