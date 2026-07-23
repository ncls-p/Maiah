import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { users } from "./auth";
import { workspaces } from "./workspace";

const CASCADE = "cascade";
const SET_NULL = "set null";

export const workflowStatusEnum = pgEnum("workflow_status", [
  "draft",
  "active",
  "archived",
]);

export const workflowRunStatusEnum = pgEnum("workflow_run_status", [
  "queued",
  "running",
  "completed",
  "failed",
  "cancelled",
]);

export const workflowStepStatusEnum = pgEnum("workflow_step_status", [
  "pending",
  "running",
  "completed",
  "failed",
  "skipped",
]);

export const workflows = pgTable(
  "workflows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: CASCADE }),
    createdById: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    status: workflowStatusEnum("status").notNull().default("draft"),
    latestVersion: integer("latest_version").notNull().default(1),
    activeVersion: integer("active_version"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (table) => [
    index("workflows_workspace_status_idx").on(table.workspaceId, table.status),
  ],
);

export const workflowVersions = pgTable(
  "workflow_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workflowId: uuid("workflow_id")
      .notNull()
      .references(() => workflows.id, { onDelete: CASCADE }),
    version: integer("version").notNull(),
    definitionJson: jsonb("definition_json").notNull(),
    createdById: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("workflow_versions_workflow_version_unique").on(
      table.workflowId,
      table.version,
    ),
  ],
);

export const workflowRuns = pgTable(
  "workflow_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: CASCADE }),
    workflowId: uuid("workflow_id")
      .notNull()
      .references(() => workflows.id, { onDelete: CASCADE }),
    workflowVersionId: uuid("workflow_version_id")
      .notNull()
      .references(() => workflowVersions.id, { onDelete: CASCADE }),
    triggeredById: uuid("triggered_by_user_id").references(() => users.id, {
      onDelete: SET_NULL,
    }),
    trigger: varchar("trigger", { length: 32 }).notNull().default("api"),
    status: workflowRunStatusEnum("status").notNull().default("queued"),
    inputJson: jsonb("input_json"),
    outputJson: jsonb("output_json"),
    error: text("error"),
    idempotencyKey: varchar("idempotency_key", { length: 255 }),
    queuedAt: timestamp("queued_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("workflow_runs_workflow_created_idx").on(
      table.workflowId,
      table.queuedAt,
    ),
    index("workflow_runs_workspace_status_idx").on(
      table.workspaceId,
      table.status,
    ),
    uniqueIndex("workflow_runs_idempotency_unique").on(
      table.workflowId,
      table.idempotencyKey,
    ),
  ],
);

export const workflowRunSteps = pgTable(
  "workflow_run_steps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => workflowRuns.id, { onDelete: CASCADE }),
    nodeId: varchar("node_id", { length: 128 }).notNull(),
    nodeType: varchar("node_type", { length: 128 }).notNull(),
    status: workflowStepStatusEnum("status").notNull().default("pending"),
    attempt: integer("attempt").notNull().default(0),
    inputJson: jsonb("input_json"),
    outputJson: jsonb("output_json"),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("workflow_run_steps_run_node_unique").on(
      table.runId,
      table.nodeId,
    ),
    index("workflow_run_steps_run_idx").on(table.runId),
  ],
);

export const workflowAgentMessages = pgTable(
  "workflow_agent_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workflowId: uuid("workflow_id")
      .notNull()
      .references(() => workflows.id, { onDelete: CASCADE }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: CASCADE }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: CASCADE }),
    role: varchar("role", { length: 16 })
      .$type<"user" | "assistant">()
      .notNull(),
    contentEncrypted: text("content_encrypted").notNull(),
    modelContentEncrypted: text("model_content_encrypted"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("workflow_agent_messages_history_idx").on(
      table.workflowId,
      table.userId,
      table.createdAt,
    ),
  ],
);

export const workflowAgentInputRequests = pgTable(
  "workflow_agent_input_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workflowId: uuid("workflow_id")
      .notNull()
      .references(() => workflows.id, { onDelete: CASCADE }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: CASCADE }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: CASCADE }),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    fieldsJson: jsonb("fields_json").notNull(),
    status: varchar("status", { length: 24 }).notNull().default("pending"),
    valuesEncrypted: text("values_encrypted"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
  },
  (table) => [
    index("workflow_agent_input_requests_pending_idx").on(
      table.workflowId,
      table.userId,
      table.status,
      table.createdAt,
    ),
    index("workflow_agent_input_requests_workspace_idx").on(table.workspaceId),
  ],
);

export const workflowAgentRunRequests = pgTable(
  "workflow_agent_run_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workflowId: uuid("workflow_id")
      .notNull()
      .references(() => workflows.id, { onDelete: CASCADE }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: CASCADE }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: CASCADE }),
    title: varchar("title", { length: 255 }).notNull(),
    reason: text("reason"),
    inputEncrypted: text("input_encrypted").notNull(),
    inputPreviewJson: jsonb("input_preview_json").notNull(),
    expectedVersion: integer("expected_version").notNull(),
    status: varchar("status", { length: 24 }).notNull().default("pending"),
    runId: uuid("run_id").references(() => workflowRuns.id, {
      onDelete: SET_NULL,
    }),
    error: text("error"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
  },
  (table) => [
    index("workflow_agent_run_requests_pending_idx").on(
      table.workflowId,
      table.userId,
      table.status,
      table.createdAt,
    ),
    index("workflow_agent_run_requests_workspace_idx").on(table.workspaceId),
    uniqueIndex("workflow_agent_run_requests_run_unique").on(table.runId),
  ],
);

export const workflowAgentTodoLists = pgTable(
  "workflow_agent_todo_lists",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workflowId: uuid("workflow_id")
      .notNull()
      .references(() => workflows.id, { onDelete: CASCADE }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: CASCADE }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: CASCADE }),
    todoListJson: jsonb("todo_list_json").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("workflow_agent_todo_lists_workflow_user_unique").on(
      table.workflowId,
      table.userId,
    ),
    index("workflow_agent_todo_lists_workspace_idx").on(table.workspaceId),
  ],
);
