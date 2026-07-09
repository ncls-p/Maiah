import {
	pgTable,
	text,
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
import { mcpServers } from "./mcp";
import { workspaces } from "./workspace";

const CREATED_AT_COLUMN = "created_at";
const UPDATED_AT_COLUMN = "updated_at";
const CASCADE_ACTION = "cascade";
const SET_NULL_ACTION = "set null";
const CREATED_BY_USER_ID_COLUMN = "created_by_user_id";
const WORKSPACE_ID_COLUMN = "workspace_id";
const USER_ID_COLUMN = "user_id";
const STATUS_COLUMN = "status";

// ─── Tool Connectors & Per-User Settings ───────────────────────────────

export const toolConnectorKindEnum = pgEnum("tool_connector_kind", [
	"mcp",
	"builtin",
	"custom",
]);

export const toolConnectionOwnerTypeEnum = pgEnum(
	"tool_connection_owner_type",
	["user", "workspace"],
);

export const toolConnectionStatusEnum = pgEnum("tool_connection_status", [
	"active",
	"invalid",
	"expired",
	"disabled",
]);

export const toolConnectors = pgTable(
	"tool_connectors",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		workspaceId: uuid(WORKSPACE_ID_COLUMN)
			.notNull()
			.references(() => workspaces.id, { onDelete: CASCADE_ACTION }),
		createdById: uuid(CREATED_BY_USER_ID_COLUMN)
			.notNull()
			.references(() => users.id),
		key: varchar("key", { length: 128 }).notNull(),
		name: varchar("name", { length: 255 }).notNull(),
		description: text("description"),
		kind: toolConnectorKindEnum("kind").notNull(),
		mcpServerId: uuid("mcp_server_id").references(() => mcpServers.id, {
			onDelete: SET_NULL_ACTION,
		}),
		configSchemaJson: jsonb("config_schema_json"),
		secretSchemaJson: jsonb("secret_schema_json"),
		defaultConfigJson: jsonb("default_config_json"),
		enabled: boolean("enabled").notNull().default(true),
		isGlobal: boolean("is_global").notNull().default(false),
		createdAt: timestamp(CREATED_AT_COLUMN, { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp(UPDATED_AT_COLUMN, { withTimezone: true })
			.notNull()
			.defaultNow(),
		archivedAt: timestamp("archived_at", { withTimezone: true }),
	},
	(t) => [
		index("tool_connectors_workspace").on(t.workspaceId),
		index("tool_connectors_mcp_server").on(t.mcpServerId),
		uniqueIndex("tool_connectors_workspace_key_unique").on(
			t.workspaceId,
			t.key,
		),
	],
);

export const toolConnections = pgTable(
	"tool_connections",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		workspaceId: uuid(WORKSPACE_ID_COLUMN)
			.notNull()
			.references(() => workspaces.id, { onDelete: CASCADE_ACTION }),
		connectorId: uuid("connector_id")
			.notNull()
			.references(() => toolConnectors.id, { onDelete: CASCADE_ACTION }),
		ownerType: toolConnectionOwnerTypeEnum("owner_type").notNull(),
		ownerUserId: uuid("owner_user_id").references(() => users.id, {
			onDelete: CASCADE_ACTION,
		}),
		label: varchar("label", { length: 255 }).notNull(),
		configJson: jsonb("config_json"),
		encryptedSecretsJson: jsonb("encrypted_secrets_json"),
		isDefault: boolean("is_default").notNull().default(false),
		status: toolConnectionStatusEnum(STATUS_COLUMN).notNull().default("active"),
		lastValidatedAt: timestamp("last_validated_at", { withTimezone: true }),
		createdAt: timestamp(CREATED_AT_COLUMN, { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp(UPDATED_AT_COLUMN, { withTimezone: true })
			.notNull()
			.defaultNow(),
		archivedAt: timestamp("archived_at", { withTimezone: true }),
	},
	(t) => [
		index("tool_connections_workspace").on(t.workspaceId),
		index("tool_connections_connector").on(t.connectorId),
		index("tool_connections_owner_user").on(t.ownerUserId),
	],
);

export const toolConnectionRequirements = pgTable(
	"tool_connection_requirements",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		workspaceId: uuid(WORKSPACE_ID_COLUMN)
			.notNull()
			.references(() => workspaces.id, { onDelete: CASCADE_ACTION }),
		connectorId: uuid("connector_id")
			.notNull()
			.references(() => toolConnectors.id, { onDelete: CASCADE_ACTION }),
		toolSource: varchar("tool_source", { length: 16 }).notNull(),
		toolId: varchar("tool_id", { length: 255 }).notNull(),
		required: boolean("required").notNull().default(true),
		configSchemaJson: jsonb("config_schema_json"),
		createdAt: timestamp(CREATED_AT_COLUMN, { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp(UPDATED_AT_COLUMN, { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		index("tool_connection_requirements_workspace").on(t.workspaceId),
		index("tool_connection_requirements_connector").on(t.connectorId),
		uniqueIndex("tool_connection_requirements_tool_unique").on(
			t.workspaceId,
			t.toolSource,
			t.toolId,
			t.connectorId,
		),
	],
);

export const userToolSettings = pgTable(
	"user_tool_settings",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		workspaceId: uuid(WORKSPACE_ID_COLUMN)
			.notNull()
			.references(() => workspaces.id, { onDelete: CASCADE_ACTION }),
		userId: uuid(USER_ID_COLUMN)
			.notNull()
			.references(() => users.id, { onDelete: CASCADE_ACTION }),
		toolSource: varchar("tool_source", { length: 16 }).notNull(),
		toolId: varchar("tool_id", { length: 255 }).notNull(),
		connectionId: uuid("connection_id").references(() => toolConnections.id, {
			onDelete: SET_NULL_ACTION,
		}),
		configJson: jsonb("config_json"),
		encryptedSecretsJson: jsonb("encrypted_secrets_json"),
		enabled: boolean("enabled").notNull().default(true),
		createdAt: timestamp(CREATED_AT_COLUMN, { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp(UPDATED_AT_COLUMN, { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		index("user_tool_settings_workspace").on(t.workspaceId),
		index("user_tool_settings_user").on(t.userId),
		index("user_tool_settings_connection").on(t.connectionId),
		uniqueIndex("user_tool_settings_tool_unique").on(
			t.workspaceId,
			t.userId,
			t.toolSource,
			t.toolId,
		),
	],
);
