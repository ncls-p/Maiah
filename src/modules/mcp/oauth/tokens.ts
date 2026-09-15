import { and, eq } from "drizzle-orm";
import { refreshAuthorization } from "@modelcontextprotocol/sdk/client/auth.js";
import {
  InvalidGrantError,
  InvalidClientError,
} from "@modelcontextprotocol/sdk/server/auth/errors.js";
import { db, withPostgresAdvisoryLock } from "@/server/infrastructure/db";
import {
  mcpOauthCredentials,
  mcpOauthAttempts,
} from "@/server/infrastructure/db/schema";
import type { McpServer } from "../use-cases.mcp-server";
import { oauthFetch } from "../network";
import { accessibleServer } from "./config";
import { McpOAuthProvider } from "./provider";
import {
  callbackUrl,
  credentialWhere,
  getConfig,
  getData,
  oauthLock,
  providerConfig,
  saveData,
} from "./store";
export async function oauthHeaders(
  server: McpServer,
  userId?: string,
  workspaceId = server.workspaceId,
): Promise<Record<string, string> | null> {
  if (!(await getConfig(server.id))) return null;
  return withPostgresAdvisoryLock(oauthLock(server.id), async () => {
    const config = await getConfig(server.id);
    if (!config) return null;
    if (!userId) throw new Error("MCP_OAUTH_CONNECT_REQUIRED");
    await accessibleServer(server.id, workspaceId, userId);
    const data = await getData(server.id, userId);
    if (
      !data?.tokens ||
      data.revision !== config.revision ||
      data.serverUrl !== server.url
    )
      throw new Error("MCP_OAUTH_CONNECT_REQUIRED");
    if (data.expiresAt !== undefined && data.expiresAt <= Date.now() + 30_000) {
      if (!data.tokens.refresh_token || !data.discovery)
        throw new Error("MCP_OAUTH_CONNECT_REQUIRED");
      const provider = new McpOAuthProvider(
        data,
        await providerConfig(config),
        callbackUrl(),
      );
      try {
        const tokens = await refreshAuthorization(
          data.discovery.authorizationServerUrl,
          {
            metadata: data.discovery.authorizationServerMetadata,
            clientInformation: provider.clientInformation()!,
            refreshToken: data.tokens.refresh_token,
            resource: new URL(
              data.discovery.resourceMetadata?.resource ?? data.serverUrl,
            ),
            fetchFn: oauthFetch,
          },
        );
        await provider.saveTokens({
          ...tokens,
          refresh_token: tokens.refresh_token ?? data.tokens.refresh_token,
        });
        await saveData(server.id, userId, data);
      } catch (error) {
        if (
          error instanceof InvalidGrantError ||
          error instanceof InvalidClientError
        ) {
          delete data.tokens;
          await saveData(server.id, userId, data);
          throw new Error("MCP_OAUTH_CONNECT_REQUIRED");
        }
        throw new Error("MCP_OAUTH_REFRESH_FAILED");
      }
    }
    return { Authorization: `Bearer ${data.tokens!.access_token}` };
  });
}
export async function disconnectOAuth(
  serverId: string,
  workspaceId: string,
  userId: string,
) {
  await accessibleServer(serverId, workspaceId, userId);
  return withPostgresAdvisoryLock(oauthLock(serverId), async () => {
    const config = await getConfig(serverId);
    const data = await getData(serverId, userId);
    // Local credentials are removed even when the remote revocation service is down.
    await db
      .delete(mcpOauthCredentials)
      .where(credentialWhere(serverId, userId));
    await db
      .delete(mcpOauthAttempts)
      .where(
        and(
          eq(mcpOauthAttempts.serverId, serverId),
          eq(mcpOauthAttempts.userId, userId),
        ),
      );
    let revocation: "revoked" | "unavailable" | "not_supported" =
      "not_supported";
    const metadata = data?.discovery?.authorizationServerMetadata;
    const endpoint =
      metadata && "revocation_endpoint" in metadata
        ? metadata.revocation_endpoint
        : undefined;
    if (config && data && typeof endpoint === "string" && data.tokens) {
      const provider = new McpOAuthProvider(
        data,
        await providerConfig(config),
        callbackUrl(),
      );
      const client = provider.clientInformation();
      try {
        for (const token of [
          data.tokens.refresh_token,
          data.tokens.access_token,
        ].filter(Boolean)) {
          const body = new URLSearchParams({
            token: token!,
            client_id: client!.client_id,
          });
          if (client?.client_secret)
            body.set("client_secret", client.client_secret);
          const response = await oauthFetch(endpoint, {
            method: "POST",
            headers: { "content-type": "application/x-www-form-urlencoded" },
            body,
          });
          await response.body?.cancel();
          if (!response.ok) throw new Error("revocation failed");
        }
        revocation = "revoked";
      } catch {
        revocation = "unavailable";
      }
    }
    return { ok: true, revocation };
  });
}
