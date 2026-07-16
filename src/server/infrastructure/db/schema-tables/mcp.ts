import {
  pgTable,
  text,
  integer,
  timestamp,
  boolean,
  varchar,
  uuid,
  jsonb,
  index,
  uniqueIndex,
  pgEnum,
} from "drizzle-orm/pg-core";
import { users } from "./auth";
import { workspaces } from "./workspace";
import { agentVersions } from "./agents";
import { conversations, messages } from "./conversations";

const CREATED_AT_COLUMN = "created_at";
const UPDATED_AT_COLUMN = "updated_at";
const CASCADE_ACTION = "cascade";
const CREATED_BY_USER_ID_COLUMN = "created_by_user_id";
const WORKSPACE_ID_COLUMN = "workspace_id";
const STATUS_COLUMN = "status";

// ─── MCP Servers ───────────────────────────────────────────────────────

export const mcpTransportEnum = pgEnum("mcp_transport", [
  "stdio",
  "sse",
  "streamable-http",
]);

export const mcpServers = pgTable(
  "mcp_servers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid(WORKSPACE_ID_COLUMN)
      .notNull()
      .references(() => workspaces.id, { onDelete: CASCADE_ACTION }),
    name: varchar("name", { length: 255 }).notNull(),
    transport: mcpTransportEnum("transport").notNull(),
    command: text("command"),
    argsJson: jsonb("args_json"),
    url: text("url"),
    encryptedHeadersJson: jsonb("encrypted_headers_json"),
    encryptedEnvJson: jsonb("encrypted_env_json"),
    enabled: boolean("enabled").notNull().default(true),
    requireApproval: boolean("require_approval").notNull().default(false),
    isGlobal: boolean("is_global").notNull().default(false),
    healthStatus: varchar("health_status", { length: 16 }),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    createdById: uuid(CREATED_BY_USER_ID_COLUMN)
      .notNull()
      .references(() => users.id),
    createdAt: timestamp(CREATED_AT_COLUMN, { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp(UPDATED_AT_COLUMN, { withTimezone: true })
      .notNull()
      .defaultNow(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [index("mcp_servers_workspace").on(t.workspaceId)],
);

export const mcpTools = pgTable(
  "mcp_tools",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    mcpServerId: uuid("mcp_server_id")
      .notNull()
      .references(() => mcpServers.id, { onDelete: CASCADE_ACTION }),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    inputSchemaJson: jsonb("input_schema_json"),
    outputSchemaJson: jsonb("output_schema_json"),
    discoveredAt: timestamp("discovered_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    enabled: boolean("enabled").notNull().default(true),
    requireApproval: boolean("require_approval").notNull().default(false),
  },
  (t) => [index("mcp_tools_server").on(t.mcpServerId)],
);

export const workspaceApiKeys = pgTable(
  "workspace_api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid(WORKSPACE_ID_COLUMN)
      .notNull()
      .references(() => workspaces.id, { onDelete: CASCADE_ACTION }),
    name: varchar("name", { length: 255 }).notNull(),
    keyPrefix: varchar("key_prefix", { length: 16 }).notNull(),
    keyHash: text("key_hash").notNull(),
    scopesJson: jsonb("scopes_json").$type<string[]>().notNull().default([]),
    createdById: uuid(CREATED_BY_USER_ID_COLUMN)
      .notNull()
      .references(() => users.id),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp(CREATED_AT_COLUMN, { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp(UPDATED_AT_COLUMN, { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("workspace_api_keys_workspace").on(t.workspaceId),
    uniqueIndex("workspace_api_keys_hash_unique").on(t.keyHash),
  ],
);

export const agentToolBindings = pgTable(
  "agent_tool_bindings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentVersionId: uuid("agent_version_id")
      .notNull()
      .references(() => agentVersions.id, { onDelete: CASCADE_ACTION }),
    toolSource: varchar("tool_source", { length: 16 }).notNull(),
    toolId: uuid("tool_id").notNull(),
    requireApproval: boolean("require_approval").notNull().default(false),
    riskLevel: varchar("risk_level", { length: 16 }),
    createdAt: timestamp(CREATED_AT_COLUMN, { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("agent_tool_bindings_version_tool_unique").on(
      t.agentVersionId,
      t.toolSource,
      t.toolId,
    ),
  ],
);

export const toolInvocations = pgTable(
  "tool_invocations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid(WORKSPACE_ID_COLUMN)
      .notNull()
      .references(() => workspaces.id, { onDelete: CASCADE_ACTION }),
    conversationId: uuid("conversation_id").references(() => conversations.id),
    messageId: uuid("message_id").references(() => messages.id),
    toolSource: varchar("tool_source", { length: 16 }).notNull(),
    toolId: uuid("tool_id").notNull(),
    toolName: varchar("tool_name", { length: 255 }).notNull(),
    riskLevel: varchar("risk_level", { length: 16 }),
    inputJsonEncrypted: text("input_json_encrypted"),
    outputJsonEncrypted: text("output_json_encrypted"),
    status: varchar(STATUS_COLUMN, { length: 24 }).notNull(),
    latencyMs: integer("latency_ms"),
    errorMessage: text("error_message"),
    approvedByUserId: uuid("approved_by_user_id"),
    createdAt: timestamp(CREATED_AT_COLUMN, { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    index("tool_invocations_workspace").on(t.workspaceId),
    index("tool_invocations_conversation").on(t.conversationId),
  ],
);
