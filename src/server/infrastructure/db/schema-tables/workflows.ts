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
