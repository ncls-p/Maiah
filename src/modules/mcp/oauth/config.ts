import { hasResourcePermissionForRequest } from "@/modules/auth/workspace-access";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, withPostgresAdvisoryLock } from "@/server/infrastructure/db";
import {
  mcpOauthConfigs,
  mcpOauthCredentials,
  mcpOauthAttempts,
} from "@/server/infrastructure/db/schema";
import { encryptValue } from "@/lib/crypto";
import { getMcpServer } from "../use-cases.create-mcp-server";
import { assertCanManageMcpServer } from "../use-cases.mcp-server";
import { assertMcpUrl } from "../network";
import { callbackUrl, getConfig, getData, oauthLock } from "./store";
export const oauthConfigInput = z.object({
  enabled: z.boolean(),
  clientId: z.string().trim().max(2048).default(""),
  clientSecret: z.string().max(8192).optional(),
  clearSecret: z.boolean().default(false),
  scopes: z.string().trim().max(2048).default(""),
  dynamicRegistration: z.boolean().default(false),
});
export async function accessibleServer(
  serverId: string,
  workspaceId: string,
  userId: string,
) {
  const server = await getMcpServer(serverId, workspaceId, userId);
  if (
    !server ||
    !(await hasResourcePermissionForRequest(
      userId,
      workspaceId,
      "mcpServers.get",
      "mcp_server",
      serverId,
    ))
  )
    throw new Error("MCP_SERVER_NOT_FOUND");
  return server;
}
export async function oauthStatus(
  serverId: string,
  workspaceId: string,
  userId: string,
) {
  const server = await accessibleServer(serverId, workspaceId, userId);
  const config = await getConfig(serverId);
  const data = config ? await getData(serverId, userId) : undefined;
  const valid =
    data?.revision === config?.revision && data?.serverUrl === server.url;
  return {
    enabled: !!config,
    clientId: config?.clientId ?? "",
    scopes: config?.scopes ?? "",
    dynamicRegistration: config?.dynamicRegistration ?? false,
    hasClientSecret: !!config?.encryptedClientSecret,
    connected: !!(valid && data?.tokens),
    needsReconnect: !!(
      valid &&
      data?.tokens &&
      data.expiresAt &&
      data.expiresAt <= Date.now() &&
      !data.tokens.refresh_token
    ),
    callbackUrl: callbackUrl(),
  };
}
export async function configureOAuth(
  serverId: string,
  workspaceId: string,
  userId: string,
  input: unknown,
  canManageGlobal = false,
) {
  const server = await accessibleServer(serverId, workspaceId, userId);
  await assertCanManageMcpServer(server, userId, canManageGlobal);
  const values = oauthConfigInput.parse(input);
  if (values.enabled && (server.transport === "stdio" || !server.url))
    throw new Error("MCP_OAUTH_HTTP_REQUIRED");
  if (values.enabled) assertMcpUrl(server.url!);
  if (values.enabled && !values.clientId && !values.dynamicRegistration)
    throw new Error("MCP_OAUTH_CLIENT_REQUIRED");
  await withPostgresAdvisoryLock(oauthLock(serverId), async () => {
    const existing = await getConfig(serverId);
    await db.transaction(async (tx) => {
      if (!values.enabled) {
        await tx
          .delete(mcpOauthConfigs)
          .where(eq(mcpOauthConfigs.serverId, serverId));
        return;
      }
      const updates = {
        clientId: values.clientId || null,
        scopes: values.scopes,
        dynamicRegistration: values.dynamicRegistration,
        revision: randomUUID(),
        encryptedClientSecret: values.clearSecret
          ? null
          : values.clientSecret
            ? await encryptValue(values.clientSecret)
            : (existing?.encryptedClientSecret ?? null),
      };
      await tx
        .insert(mcpOauthConfigs)
        .values({ serverId, ...updates })
        .onConflictDoUpdate({ target: mcpOauthConfigs.serverId, set: updates });
      await tx
        .delete(mcpOauthCredentials)
        .where(eq(mcpOauthCredentials.serverId, serverId));
      await tx
        .delete(mcpOauthAttempts)
        .where(eq(mcpOauthAttempts.serverId, serverId));
    });
  });
  return oauthStatus(serverId, workspaceId, userId);
}
