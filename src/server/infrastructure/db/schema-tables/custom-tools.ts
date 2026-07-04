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
import { workspaces } from "./workspace";
import { agents } from "./agents";
import { conversations } from "./conversations";

const CREATED_AT_COLUMN = "created_at";
const UPDATED_AT_COLUMN = "updated_at";
const CASCADE_ACTION = "cascade";
const SET_NULL_ACTION = "set null";
const CREATED_BY_USER_ID_COLUMN = "created_by_user_id";
const WORKSPACE_ID_COLUMN = "workspace_id";
const USER_ID_COLUMN = "user_id";
const STATUS_COLUMN = "status";

// ─── Custom Tool Builder ───────────────────────────────────────────────

export const customToolStatusEnum = pgEnum("custom_tool_status", [
  "draft",
  "awaiting_secrets",
  "workflow_created",
  "active",
  "failed",
  "disabled",
]);

export const customTools = pgTable(
  "custom_tools",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid(WORKSPACE_ID_COLUMN)
      .notNull()
      .references(() => workspaces.id, { onDelete: CASCADE_ACTION }),
    createdById: uuid(CREATED_BY_USER_ID_COLUMN)
      .notNull()
      .references(() => users.id),
    isGlobal: boolean("is_global").notNull().default(false),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    n8nWorkflowId: varchar("n8n_workflow_id", { length: 255 }),
    n8nWorkflowUrl: text("n8n_workflow_url"),
    status: customToolStatusEnum(STATUS_COLUMN).notNull().default("draft"),
    inputSchemaJson: jsonb("input_schema_json"),
    outputSchemaJson: jsonb("output_schema_json"),
    metadataJson: jsonb("metadata_json"),
    createdAt: timestamp(CREATED_AT_COLUMN, { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp(UPDATED_AT_COLUMN, { withTimezone: true })
      .notNull()
      .defaultNow(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [index("custom_tools_workspace").on(t.workspaceId)],
);

export const customToolSecretRequests = pgTable(
  "custom_tool_secret_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid(WORKSPACE_ID_COLUMN)
      .notNull()
      .references(() => workspaces.id, { onDelete: CASCADE_ACTION }),
    userId: uuid(USER_ID_COLUMN)
      .notNull()
      .references(() => users.id),
    customToolId: uuid("custom_tool_id").references(() => customTools.id, {
      onDelete: SET_NULL_ACTION,
    }),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    fieldsJson: jsonb("fields_json").notNull(),
    status: varchar(STATUS_COLUMN, { length: 24 }).notNull().default("pending"),
    credentialRefId: uuid("credential_ref_id"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp(CREATED_AT_COLUMN, { withTimezone: true })
      .notNull()
      .defaultNow(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
  },
  (t) => [
    index("custom_tool_secret_requests_workspace").on(t.workspaceId),
    index("custom_tool_secret_requests_user").on(t.userId),
  ],
);

export const customToolCredentialRefs = pgTable(
  "custom_tool_credential_refs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid(WORKSPACE_ID_COLUMN)
      .notNull()
      .references(() => workspaces.id, { onDelete: CASCADE_ACTION }),
    userId: uuid(USER_ID_COLUMN)
      .notNull()
      .references(() => users.id),
    provider: varchar("provider", { length: 128 }).notNull(),
    label: varchar("label", { length: 255 }).notNull(),
    n8nCredentialId: varchar("n8n_credential_id", { length: 255 }),
    encryptedPayload: text("encrypted_payload").notNull(),
    metadataJson: jsonb("metadata_json"),
    createdAt: timestamp(CREATED_AT_COLUMN, { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("custom_tool_credential_refs_workspace").on(t.workspaceId),
    index("custom_tool_credential_refs_user").on(t.userId),
  ],
);

export const userGithubConnections = pgTable(
  "user_github_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid(USER_ID_COLUMN)
      .notNull()
      .references(() => users.id, { onDelete: CASCADE_ACTION }),
    installationId: varchar("installation_id", { length: 64 }).notNull(),
    accountLogin: varchar("account_login", { length: 255 }).notNull(),
    accountId: varchar("account_id", { length: 64 }),
    accountType: varchar("account_type", { length: 32 }),
    repositorySelection: varchar("repository_selection", { length: 32 }),
    settingsUrl: text("settings_url"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp(CREATED_AT_COLUMN, { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp(UPDATED_AT_COLUMN, { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("user_github_connections_user").on(t.userId),
    uniqueIndex("user_github_connections_user_installation_unique").on(
      t.userId,
      t.installationId,
    ),
  ],
);

export const userGithubRepositories = pgTable(
  "user_github_repositories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => userGithubConnections.id, { onDelete: CASCADE_ACTION }),
    userId: uuid(USER_ID_COLUMN)
      .notNull()
      .references(() => users.id, { onDelete: CASCADE_ACTION }),
    githubRepositoryId: varchar("github_repository_id", {
      length: 64,
    }).notNull(),
    owner: varchar("owner", { length: 255 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    fullName: varchar("full_name", { length: 512 }).notNull(),
    private: boolean("private").notNull().default(false),
    defaultBranch: varchar("default_branch", { length: 255 }).notNull(),
    permissionsJson: jsonb("permissions_json"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("user_github_repositories_user").on(t.userId),
    index("user_github_repositories_connection").on(t.connectionId),
    uniqueIndex("user_github_repositories_user_repo_unique").on(
      t.userId,
      t.owner,
      t.name,
    ),
    index("user_github_repositories_github_repo").on(t.githubRepositoryId),
  ],
);

export const githubPublishEvents = pgTable(
  "github_publish_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid(WORKSPACE_ID_COLUMN)
      .notNull()
      .references(() => workspaces.id, { onDelete: CASCADE_ACTION }),
    userId: uuid(USER_ID_COLUMN)
      .notNull()
      .references(() => users.id),
    connectionId: uuid("connection_id").references(
      () => userGithubConnections.id,
      { onDelete: SET_NULL_ACTION },
    ),
    repositoryId: uuid("repository_id").references(
      () => userGithubRepositories.id,
      { onDelete: SET_NULL_ACTION },
    ),
    codeWorkspaceId: uuid("code_workspace_id").notNull(),
    conversationId: uuid("conversation_id").references(() => conversations.id, {
      onDelete: SET_NULL_ACTION,
    }),
    agentId: uuid("agent_id").references(() => agents.id, {
      onDelete: SET_NULL_ACTION,
    }),
    mode: varchar("mode", { length: 24 }).notNull(),
    targetBranch: varchar("target_branch", { length: 255 }).notNull(),
    sourceBranch: varchar("source_branch", { length: 255 }),
    commitSha: varchar("commit_sha", { length: 64 }),
    pullRequestUrl: text("pull_request_url"),
    status: varchar(STATUS_COLUMN, { length: 24 }).notNull(),
    metadataJson: jsonb("metadata_json"),
    createdAt: timestamp(CREATED_AT_COLUMN, { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("github_publish_events_workspace").on(t.workspaceId),
    index("github_publish_events_user").on(t.userId),
    index("github_publish_events_repository").on(t.repositoryId),
  ],
);
