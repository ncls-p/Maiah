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
  pgEnum,
} from "drizzle-orm/pg-core";
import { users } from "./auth";
import { workspaces } from "./workspace";
import { agents, agentVersions } from "./agents";

const CREATED_AT_COLUMN = "created_at";
const UPDATED_AT_COLUMN = "updated_at";
const CASCADE_ACTION = "cascade";
const SET_NULL_ACTION = "set null";
const WORKSPACE_ID_COLUMN = "workspace_id";
const USER_ID_COLUMN = "user_id";
const STATUS_COLUMN = "status";

// ─── Conversations & Messages ──────────────────────────────────────────

export const conversationStatusEnum = pgEnum("conversation_status", [
  "active",
  "archived",
  "deleted",
]);

export const conversationFolders = pgTable(
  "conversation_folders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid(WORKSPACE_ID_COLUMN)
      .notNull()
      .references(() => workspaces.id, { onDelete: CASCADE_ACTION }),
    userId: uuid(USER_ID_COLUMN)
      .notNull()
      .references(() => users.id, { onDelete: CASCADE_ACTION }),
    name: varchar("name", { length: 160 }).notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp(CREATED_AT_COLUMN, { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp(UPDATED_AT_COLUMN, { withTimezone: true })
      .notNull()
      .defaultNow(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    index("conversation_folders_user_workspace_order").on(
      t.userId,
      t.workspaceId,
      t.archivedAt,
      t.sortOrder,
      t.createdAt,
      t.id,
    ),
  ],
);

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid(WORKSPACE_ID_COLUMN)
      .notNull()
      .references(() => workspaces.id, { onDelete: CASCADE_ACTION }),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: CASCADE_ACTION }),
    agentVersionId: uuid("agent_version_id").references(() => agentVersions.id),
    userId: uuid(USER_ID_COLUMN)
      .notNull()
      .references(() => users.id),
    title: varchar("title", { length: 512 }).notNull().default("New Chat"),
    status: conversationStatusEnum(STATUS_COLUMN).notNull().default("active"),
    folderId: uuid("folder_id").references(() => conversationFolders.id, {
      onDelete: SET_NULL_ACTION,
    }),
    pinnedAt: timestamp("pinned_at", { withTimezone: true }),
    sidebarOrder: integer("sidebar_order"),
    parentConversationId: uuid("parent_conversation_id"),
    branchFromMessageId: uuid("branch_from_message_id"),
    createdAt: timestamp(CREATED_AT_COLUMN, { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp(UPDATED_AT_COLUMN, { withTimezone: true })
      .notNull()
      .defaultNow(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    index("conversations_workspace_agent").on(t.workspaceId, t.agentId),
    index("conversations_user").on(t.userId),
    index("conversations_user_workspace_updated").on(
      t.userId,
      t.workspaceId,
      t.status,
      t.archivedAt,
      t.updatedAt,
      t.id,
    ),
    index("conversations_sidebar_order").on(
      t.userId,
      t.workspaceId,
      t.folderId,
      t.pinnedAt,
      t.sidebarOrder,
      t.updatedAt,
      t.id,
    ),
  ],
);

export const messageRoleEnum = pgEnum("message_role", [
  "user",
  "assistant",
  "system",
  "tool",
]);
export const messageStatusEnum = pgEnum("message_status", [
  "pending",
  "streaming",
  "completed",
  "failed",
  "cancelled",
]);

export const scheduledTaskFrequencyEnum = pgEnum("scheduled_task_frequency", [
  "daily",
  "interval",
]);

export const scheduledTaskStatusEnum = pgEnum("scheduled_task_status", [
  "idle",
  "running",
  "success",
  "failed",
]);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id").notNull(),
    role: messageRoleEnum("role").notNull(),
    status: messageStatusEnum(STATUS_COLUMN).notNull().default("pending"),
    tokenInput: integer("token_input"),
    tokenOutput: integer("token_output"),
    costUsd: text("cost_usd"),
    modelId: varchar("model_id", { length: 255 }),
    providerId: uuid("provider_id"),
    createdAt: timestamp(CREATED_AT_COLUMN, { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    index("messages_conversation").on(t.conversationId),
    index("messages_conversation_created").on(t.conversationId, t.createdAt),
  ],
);

export const messagePartTypeEnum = pgEnum("message_part_type", [
  "text",
  "file",
  "tool-call",
  "tool-result",
  "reasoning",
  "error",
  "citation",
  "citations",
  "suggestions",
]);

export const scheduledTasks = pgTable(
  "scheduled_tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid(WORKSPACE_ID_COLUMN)
      .notNull()
      .references(() => workspaces.id, { onDelete: CASCADE_ACTION }),
    userId: uuid(USER_ID_COLUMN)
      .notNull()
      .references(() => users.id, { onDelete: CASCADE_ACTION }),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: CASCADE_ACTION }),
    conversationId: uuid("conversation_id").references(() => conversations.id, {
      onDelete: SET_NULL_ACTION,
    }),
    title: varchar("title", { length: 255 }).notNull(),
    prompt: text("prompt").notNull(),
    frequency: scheduledTaskFrequencyEnum("frequency").notNull(),
    timezone: varchar("timezone", { length: 64 }).notNull().default("UTC"),
    timeOfDay: varchar("time_of_day", { length: 5 }),
    intervalMinutes: integer("interval_minutes"),
    enabled: boolean("enabled").notNull().default(true),
    nextRunAt: timestamp("next_run_at", { withTimezone: true }).notNull(),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    lastStatus: scheduledTaskStatusEnum("last_status")
      .notNull()
      .default("idle"),
    lastError: text("last_error"),
    createdAt: timestamp(CREATED_AT_COLUMN, { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp(UPDATED_AT_COLUMN, { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("scheduled_tasks_due").on(t.enabled, t.nextRunAt),
    index("scheduled_tasks_workspace_user").on(t.workspaceId, t.userId),
  ],
);

export const messageParts = pgTable(
  "message_parts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    messageId: uuid("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: CASCADE_ACTION }),
    type: messagePartTypeEnum("type").notNull(),
    contentEncrypted: text("content_encrypted"),
    metadataJson: jsonb("metadata_json"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp(CREATED_AT_COLUMN, { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("message_parts_message").on(t.messageId, t.sortOrder)],
);
