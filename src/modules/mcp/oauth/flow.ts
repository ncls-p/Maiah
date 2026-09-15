import { createHash, randomBytes } from "node:crypto";
import { and, eq, lt } from "drizzle-orm";
import {
  auth,
  extractWWWAuthenticateParams,
} from "@modelcontextprotocol/sdk/client/auth.js";
import { db, withPostgresAdvisoryLock } from "@/server/infrastructure/db";
import { mcpOauthAttempts } from "@/server/infrastructure/db/schema";
import { encryptValue, decryptValue } from "@/lib/crypto";
import { oauthFetch } from "../network";
import { accessibleServer } from "./config";
import { McpOAuthProvider, type OAuthData } from "./provider";
import {
  callbackUrl,
  getConfig,
  oauthLock,
  providerConfig,
  saveData,
} from "./store";
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export async function beginOAuth(
  serverId: string,
  workspaceId: string,
  userId: string,
) {
  return withPostgresAdvisoryLock(oauthLock(serverId), async () => {
    const server = await accessibleServer(serverId, workspaceId, userId);
    const config = await getConfig(serverId);
    if (
      !config ||
      !server.enabled ||
      !server.url ||
      server.transport === "stdio"
    )
      throw new Error("MCP_OAUTH_NOT_CONFIGURED");
    const state = randomBytes(32).toString("base64url");
    const provider = new McpOAuthProvider(
      { revision: config.revision, serverUrl: server.url },
      await providerConfig(config),
      callbackUrl(),
      state,
    );
    // Probe only for metadata/scope challenges. Never send credentials to discovery.
    const response = await oauthFetch(server.url, { method: "GET" });
    const challenge = extractWWWAuthenticateParams(response);
    await response.body?.cancel();
    await auth(provider, {
      serverUrl: server.url,
      scope: config.scopes || challenge.scope,
      resourceMetadataUrl: challenge.resourceMetadataUrl,
      fetchFn: oauthFetch,
    });
    if (!provider.authorizationUrl)
      throw new Error("MCP_OAUTH_AUTHORIZATION_FAILED");
    await db.transaction(async (tx) => {
      await tx
        .delete(mcpOauthAttempts)
        .where(lt(mcpOauthAttempts.expiresAt, new Date()));
      await tx
        .delete(mcpOauthAttempts)
        .where(
          and(
            eq(mcpOauthAttempts.serverId, serverId),
            eq(mcpOauthAttempts.userId, userId),
          ),
        );
      await tx.insert(mcpOauthAttempts).values({
        serverId,
        userId,
        workspaceId,
        stateHash: hash(state),
        expiresAt: new Date(Date.now() + 600_000),
        encryptedData: await encryptValue(JSON.stringify(provider.data)),
      });
    });
    return { authorizationUrl: provider.authorizationUrl };
  });
}
export async function finishOAuth(
  userId: string,
  state: string,
  code?: string,
  error?: string,
) {
  // Consume the attempt before network I/O. Another callback cannot redeem it again.
  const [attempt] = await db
    .delete(mcpOauthAttempts)
    .where(
      and(
        eq(mcpOauthAttempts.stateHash, hash(state)),
        eq(mcpOauthAttempts.userId, userId),
      ),
    )
    .returning();
  if (!attempt || attempt.expiresAt.getTime() < Date.now())
    throw new Error("MCP_OAUTH_STATE_INVALID");
  if (error || !code) throw new Error("MCP_OAUTH_DENIED");
  await withPostgresAdvisoryLock(oauthLock(attempt.serverId), async () => {
    const server = await accessibleServer(
      attempt.serverId,
      attempt.workspaceId,
      userId,
    );
    const config = await getConfig(attempt.serverId);
    const data: OAuthData = JSON.parse(
      await decryptValue(attempt.encryptedData),
    );
    if (
      !server.enabled ||
      !config ||
      config.revision !== data.revision ||
      data.serverUrl !== server.url
    )
      throw new Error("MCP_OAUTH_CONFIGURATION_CHANGED");
    const provider = new McpOAuthProvider(
      data,
      await providerConfig(config),
      callbackUrl(),
    );
    await auth(provider, {
      serverUrl: data.serverUrl,
      authorizationCode: code,
      fetchFn: oauthFetch,
    });
    delete provider.data.verifier;
    await saveData(attempt.serverId, userId, provider.data);
  });
  return { serverId: attempt.serverId, workspaceId: attempt.workspaceId };
}
