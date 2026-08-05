import {
createCipheriv,
createHash,
createHmac,
randomBytes,
} from "node:crypto";

import { env } from "@/lib/env";
import { db } from "@/server/infrastructure/db";
import {
toolConnections
} from "@/server/infrastructure/db/schema";
import { and,desc,eq,isNull,or } from "drizzle-orm";
import {
CONTEXT_HEADER,
CONTEXT_TTL_MS,
JsonRecord,
ResolveToolExecutionHeadersInput,
SIGNATURE_HEADER,
UserToolSetting,
decryptRecord,
jsonRecord,
} from "./use-cases.mcp-tool-source";
import { findConnectorForTool,findUserToolSettings } from "./use-cases.upsert-tool-connection-requirement";

async function findVisibleConnection(
  connectionId: string,
  workspaceId: string,
  userId: string,
) {
  const [connection] = await db
    .select()
    .from(toolConnections)
    .where(
      and(
        eq(toolConnections.id, connectionId),
        eq(toolConnections.workspaceId, workspaceId),
        eq(toolConnections.status, "active"),
        isNull(toolConnections.archivedAt),
        or(
          eq(toolConnections.ownerUserId, userId),
          eq(toolConnections.ownerType, "workspace"),
        ),
      ),
    )
    .limit(1);
  return connection ?? null;
}

async function findPreferredConnection(
  connectorId: string,
  input: ResolveToolExecutionHeadersInput,
  settings: UserToolSetting | null,
) {
  if (settings?.connectionId) {
    const connection = await findVisibleConnection(
      settings.connectionId,
      input.workspaceId,
      input.userId,
    );
    if (connection) return connection;
  }

  const connections = await db
    .select()
    .from(toolConnections)
    .where(
      and(
        eq(toolConnections.workspaceId, input.workspaceId),
        eq(toolConnections.connectorId, connectorId),
        eq(toolConnections.status, "active"),
        isNull(toolConnections.archivedAt),
        or(
          eq(toolConnections.ownerUserId, input.userId),
          eq(toolConnections.ownerType, "workspace"),
        ),
      ),
    )
    .orderBy(desc(toolConnections.isDefault), desc(toolConnections.createdAt));

  return (
    connections.find(
      (connection) =>
        connection.ownerUserId === input.userId && connection.isDefault,
    ) ??
    connections.find(
      (connection) =>
        connection.ownerType === "workspace" && connection.isDefault,
    ) ??
    connections.find((connection) => connection.ownerUserId === input.userId) ??
    connections.find((connection) => connection.ownerType === "workspace") ??
    null
  );
}

function gatewaySecret() {
  const secret = env.MCP_GATEWAY_SHARED_SECRET;
  if (!secret) {
    throw new Error(
      "MCP_GATEWAY_SHARED_SECRET is required for gateway-backed tool execution",
    );
  }
  return secret;
}

function signContext(encodedContext: string) {
  return createHmac("sha256", gatewaySecret())
    .update(encodedContext)
    .digest("hex");
}

function encryptionKey() {
  return createHash("sha256").update(gatewaySecret()).digest();
}

function encodeContext(payload: JsonRecord) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);
  const envelope = {
    v: 1,
    alg: "A256GCM",
    iv: iv.toString("base64url"),
    ciphertext: ciphertext.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
  };
  return Buffer.from(JSON.stringify(envelope), "utf8").toString("base64url");
}

export function buildSignedToolContextHeaders(payload: JsonRecord) {
  const encoded = encodeContext(payload);
  return {
    [CONTEXT_HEADER]: encoded,
    [SIGNATURE_HEADER]: signContext(encoded),
  };
}

export async function resolveToolExecutionHeaders(
  input: ResolveToolExecutionHeadersInput,
) {
  const { connector, required } = await findConnectorForTool(input);
  if (!connector) return {};

  const settings = await findUserToolSettings(input);
  if (settings && !settings.enabled) {
    throw new Error("Tool disabled in user settings");
  }

  const connection = await findPreferredConnection(
    connector.id,
    input,
    settings,
  );
  if (!connection) {
    if (required) {
      throw new Error(
        `Tool connection required for connector '${connector.key}'`,
      );
    }
    return {};
  }

  const connectionSecrets = await decryptRecord(
    connection.encryptedSecretsJson,
  );
  const settingsSecrets = await decryptRecord(settings?.encryptedSecretsJson);
  const now = Date.now();
  const payload = {
    version: 1,
    workspaceId: input.workspaceId,
    userId: input.userId,
    connectorId: connector.id,
    connectorKey: connector.key,
    connectionId: connection.id,
    issuedAt: now,
    expiresAt: now + CONTEXT_TTL_MS,
    config: {
      ...jsonRecord(connector.defaultConfigJson),
      ...jsonRecord(connection.configJson),
    },
    settings: jsonRecord(settings?.configJson),
    secrets: {
      ...connectionSecrets,
      ...settingsSecrets,
    },
  };

  return buildSignedToolContextHeaders(payload);
}

export function toolContextHeaderNames() {
  return {
    context: CONTEXT_HEADER,
    signature: SIGNATURE_HEADER,
  } as const;
}
