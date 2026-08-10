import { decryptValue, encryptValue } from "@/lib/crypto";
import { authorization } from "@/server/domain/services/authorization";
import {
  toolConnections,
  toolConnectors,
  userToolSettings,
} from "@/server/infrastructure/db/schema";
import { and, eq, isNull, or } from "drizzle-orm";

export const MCP_TOOL_SOURCE = "mcp";
export const CONTEXT_HEADER = "x-maiah-tool-context";
export const SIGNATURE_HEADER = "x-maiah-tool-context-signature";
export const CONTEXT_TTL_MS = 5 * 60 * 1000;

export type ToolConnector = typeof toolConnectors.$inferSelect;
export type ToolConnection = typeof toolConnections.$inferSelect;
export type UserToolSetting = typeof userToolSettings.$inferSelect;

type ToolConnectorKind = "mcp" | "builtin" | "custom";
type ToolConnectionOwnerType = "user" | "workspace";

export type JsonRecord = Record<string, unknown>;
type SecretRecord = Record<string, string>;

export interface CreateToolConnectorInput {
  workspaceId: string;
  userId: string;
  key: string;
  name: string;
  description?: string | null;
  kind: ToolConnectorKind;
  mcpServerId?: string | null;
  configSchema?: JsonRecord | null;
  secretSchema?: JsonRecord | null;
  defaultConfig?: JsonRecord | null;
  isGlobal?: boolean;
}

export interface CreateToolConnectionInput {
  workspaceId: string;
  userId: string;
  connectorId: string;
  ownerType?: ToolConnectionOwnerType;
  label: string;
  config?: JsonRecord;
  secrets?: SecretRecord;
  isDefault?: boolean;
  canManageWorkspaceConnections?: boolean;
}

export interface UpdateToolConnectionInput {
  connectionId: string;
  workspaceId: string;
  userId: string;
  label?: string;
  config?: JsonRecord | null;
  secrets?: SecretRecord | null;
  isDefault?: boolean;
  status?: "active" | "invalid" | "expired" | "disabled";
  canManageWorkspaceConnections?: boolean;
}

export interface UpsertUserToolSettingsInput {
  workspaceId: string;
  userId: string;
  toolSource: string;
  toolId: string;
  connectionId?: string | null;
  config?: JsonRecord | null;
  secrets?: SecretRecord | null;
  enabled?: boolean;
}

export interface UpsertToolConnectionRequirementInput {
  workspaceId: string;
  connectorId: string;
  toolSource: string;
  toolId: string;
  required?: boolean;
  configSchema?: JsonRecord | null;
}

export interface ResolveToolExecutionHeadersInput {
  workspaceId: string;
  userId: string;
  toolSource: string;
  toolId: string;
  mcpServerId?: string;
}

export function normalizeConnectorKey(key: string) {
  return key
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-");
}

export function jsonRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function isSecretRecord(value: unknown): value is SecretRecord {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.values(value).every((item) => typeof item === "string")
  );
}

export async function encryptRecord(record?: SecretRecord | null) {
  if (!record) return null;
  const encrypted: SecretRecord = {};
  for (const [key, value] of Object.entries(record)) {
    if (!value) continue;
    encrypted[key] = await encryptValue(value);
  }
  return encrypted;
}

export async function decryptRecord(encrypted?: unknown) {
  if (!isSecretRecord(encrypted)) return {};
  const decrypted: SecretRecord = {};
  for (const [key, value] of Object.entries(encrypted)) {
    decrypted[key] = await decryptValue(value);
  }
  return decrypted;
}

export function visibleConnectorCondition(
  workspaceId: string,
  userId: string,
  canManageGlobal = false,
) {
  return and(
    eq(toolConnectors.workspaceId, workspaceId),
    isNull(toolConnectors.archivedAt),
    canManageGlobal
      ? undefined
      : or(
          eq(toolConnectors.createdById, userId),
          eq(toolConnectors.isGlobal, true),
        ),
  );
}

export async function canManageConnection(
  connection: ToolConnection,
  userId: string,
  canManageWorkspaceConnections = false,
) {
  if (
    (connection.ownerType === "user" && connection.ownerUserId === userId) ||
    (connection.ownerType === "workspace" && canManageWorkspaceConnections)
  ) {
    return true;
  }
  return authorization.hasPermission(
    { principalType: "user", principalId: userId },
    "tools.configure",
    "tool_connection",
    connection.id,
  );
}
