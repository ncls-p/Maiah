import { and, eq } from "drizzle-orm";
import { db } from "@/server/infrastructure/db";
import {
  mcpOauthConfigs,
  mcpOauthCredentials,
} from "@/server/infrastructure/db/schema";
import { decryptValue, encryptValue } from "@/lib/crypto";
import { env } from "@/lib/env";
import type { OAuthData } from "./provider";
export const callbackUrl = () =>
  new URL("/api/mcp/oauth/callback", env.BETTER_AUTH_URL).href;
export const credentialWhere = (serverId: string, userId: string) =>
  and(
    eq(mcpOauthCredentials.serverId, serverId),
    eq(mcpOauthCredentials.userId, userId),
  );
export const oauthLock = (serverId: string) => `mcp-oauth:${serverId}`;
export async function getConfig(serverId: string) {
  const [config] = await db
    .select()
    .from(mcpOauthConfigs)
    .where(eq(mcpOauthConfigs.serverId, serverId));
  return config;
}
export async function getData(
  serverId: string,
  userId: string,
): Promise<OAuthData | undefined> {
  const [row] = await db
    .select()
    .from(mcpOauthCredentials)
    .where(credentialWhere(serverId, userId));
  return row ? JSON.parse(await decryptValue(row.encryptedData)) : undefined;
}
export async function saveData(
  serverId: string,
  userId: string,
  data: OAuthData,
) {
  const encryptedData = await encryptValue(JSON.stringify(data));
  await db
    .insert(mcpOauthCredentials)
    .values({ serverId, userId, encryptedData })
    .onConflictDoUpdate({
      target: [mcpOauthCredentials.serverId, mcpOauthCredentials.userId],
      set: { encryptedData, updatedAt: new Date() },
    });
}
export async function providerConfig(
  config: NonNullable<Awaited<ReturnType<typeof getConfig>>>,
) {
  return {
    ...config,
    clientSecret: config.encryptedClientSecret
      ? await decryptValue(config.encryptedClientSecret)
      : undefined,
  };
}
