import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";

import { audit } from "@/server/domain/services/audit";
import { db } from "@/server/infrastructure/db";
import { workspaceApiKeys } from "@/server/infrastructure/db/schema";
import {
  isKnownApiKeyScope,
  uniqueApiKeyScopes,
} from "@/modules/api-keys/scopes";
import { getAvailableApiKeyScopes } from "@/modules/api-keys/permissions";
import { getRequestAuthContext } from "@/modules/auth/request-auth-context";

const KEY_PREFIX = "ahub_";

function auditActor(fallbackUserId: string) {
  const auth = getRequestAuthContext();
  return auth?.type === "api_key"
    ? {
        actorPrincipalType: "api_key" as const,
        actorPrincipalId: auth.apiKeyId,
      }
    : { actorPrincipalType: "user" as const, actorPrincipalId: fallbackUserId };
}

function hashApiKey(rawKey: string) {
  return createHash("sha256").update(rawKey).digest("hex");
}

function generateRawApiKey() {
  return `${KEY_PREFIX}${randomBytes(24).toString("base64url")}`;
}

export type SafeApiKey = {
  id: string;
  workspaceId: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  createdById: string;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
};

function toSafeKey(row: typeof workspaceApiKeys.$inferSelect): SafeApiKey {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    keyPrefix: row.keyPrefix,
    scopes: row.scopesJson,
    createdById: row.createdById,
    lastUsedAt: row.lastUsedAt,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
    createdAt: row.createdAt,
  };
}

export async function createWorkspaceApiKey(input: {
  workspaceId: string;
  userId: string;
  name: string;
  expiresAt?: Date | null;
  scopes: string[];
}) {
  const scopes = uniqueApiKeyScopes(input.scopes);
  if (scopes.length === 0) {
    throw new Error("At least one API token scope is required");
  }
  const unknownScopes = scopes.filter((scope) => !isKnownApiKeyScope(scope));
  if (unknownScopes.length > 0) {
    throw new Error(`Unknown API token scopes: ${unknownScopes.join(", ")}`);
  }

  const availableScopes = await getAvailableApiKeyScopes(
    input.userId,
    input.workspaceId,
  );
  const availablePermissions = new Set<string>(
    availableScopes.map(({ permission }) => permission),
  );
  const forbiddenScopes = scopes.filter(
    (scope) => !availablePermissions.has(scope),
  );
  if (forbiddenScopes.length > 0) {
    throw new Error(
      `API token scopes exceed current permissions: ${forbiddenScopes.join(", ")}`,
    );
  }

  const rawKey = generateRawApiKey();
  const keyHash = hashApiKey(rawKey);
  const keyPrefix = rawKey.slice(0, 12);

  const [row] = await db
    .insert(workspaceApiKeys)
    .values({
      workspaceId: input.workspaceId,
      name: input.name,
      keyPrefix,
      keyHash,
      scopesJson: scopes,
      createdById: input.userId,
      expiresAt: input.expiresAt ?? null,
    })
    .returning();

  await audit.emit({
    workspaceId: input.workspaceId,
    ...auditActor(input.userId),
    action: "apiKey.created",
    resourceType: "workspace",
    resourceId: row.id,
    outcome: "success",
    metadata: { name: input.name, keyPrefix, scopes },
  });

  return { apiKey: toSafeKey(row), rawKey };
}

export async function listWorkspaceApiKeys(
  workspaceId: string,
  options: { createdById?: string } = {},
) {
  const conditions = [
    eq(workspaceApiKeys.workspaceId, workspaceId),
    isNull(workspaceApiKeys.revokedAt),
  ];
  if (options.createdById) {
    conditions.push(eq(workspaceApiKeys.createdById, options.createdById));
  }

  const rows = await db
    .select()
    .from(workspaceApiKeys)
    .where(and(...conditions));
  return rows.map(toSafeKey);
}

export async function revokeWorkspaceApiKey(input: {
  keyId: string;
  workspaceId: string;
  userId: string;
  createdById?: string;
}) {
  const conditions = [
    eq(workspaceApiKeys.id, input.keyId),
    eq(workspaceApiKeys.workspaceId, input.workspaceId),
    isNull(workspaceApiKeys.revokedAt),
  ];
  if (input.createdById) {
    conditions.push(eq(workspaceApiKeys.createdById, input.createdById));
  }

  const [row] = await db
    .select()
    .from(workspaceApiKeys)
    .where(and(...conditions))
    .limit(1);

  if (!row) throw new Error("API key not found");

  await db
    .update(workspaceApiKeys)
    .set({ revokedAt: new Date(), updatedAt: new Date() })
    .where(eq(workspaceApiKeys.id, input.keyId));

  await audit.emit({
    workspaceId: input.workspaceId,
    ...auditActor(input.userId),
    action: "apiKey.revoked",
    resourceType: "workspace",
    resourceId: input.keyId,
    outcome: "success",
  });
}

export async function verifyWorkspaceApiKey(rawKey: string) {
  if (!rawKey.startsWith(KEY_PREFIX)) return null;

  const keyHash = hashApiKey(rawKey);
  const [row] = await db
    .select()
    .from(workspaceApiKeys)
    .where(
      and(
        eq(workspaceApiKeys.keyHash, keyHash),
        isNull(workspaceApiKeys.revokedAt),
      ),
    )
    .limit(1);

  if (!row) return null;
  if (row.expiresAt && row.expiresAt.getTime() < Date.now()) return null;

  await db
    .update(workspaceApiKeys)
    .set({ lastUsedAt: new Date(), updatedAt: new Date() })
    .where(eq(workspaceApiKeys.id, row.id));

  return {
    id: row.id,
    workspaceId: row.workspaceId,
    createdById: row.createdById,
    name: row.name,
    scopes: row.scopesJson,
  };
}
