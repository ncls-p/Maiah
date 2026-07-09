import { sql } from "drizzle-orm";
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
import { agents, agentVersions } from "./agents";
import { conversations, messages, scheduledTasks } from "./conversations";
import { workspaces } from "./workspace";

const CASCADE_ACTION = "cascade";
const SET_NULL_ACTION = "set null";

export const agentRunStatusEnum = pgEnum("agent_run_status", [
  "queued",
  "running",
  "waiting_approval",
  "success",
  "failed",
  "cancelled",
  "timed_out",
]);

export const agentRunTriggerEnum = pgEnum("agent_run_trigger", [
  "chat",
  "scheduled",
  "api",
  "delegation",
  "dry_run",
]);

export const agentRunStepKindEnum = pgEnum("agent_run_step_kind", [
  "model",
  "tool",
  "delegation",
  "approval",
]);

export const tokenReservationStatusEnum = pgEnum("token_reservation_status", [
  "active",
  "settled",
  "released",
  "expired",
]);

export const agentRuns = pgTable(
  "agent_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: CASCADE_ACTION }),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: CASCADE_ACTION }),
    agentVersionId: uuid("agent_version_id")
      .notNull()
      .references(() => agentVersions.id),
    rootRunId: uuid("root_run_id").notNull(),
    parentRunId: uuid("parent_run_id"),
    conversationId: uuid("conversation_id").references(() => conversations.id, {
      onDelete: SET_NULL_ACTION,
    }),
    messageId: uuid("message_id").references(() => messages.id, {
      onDelete: SET_NULL_ACTION,
    }),
    scheduledTaskId: uuid("scheduled_task_id").references(
      () => scheduledTasks.id,
      { onDelete: SET_NULL_ACTION },
    ),
    trigger: agentRunTriggerEnum("trigger").notNull(),
    status: agentRunStatusEnum("status").notNull().default("queued"),
    actorPrincipalType: varchar("actor_principal_type", {
      length: 32,
    }).notNull(),
    actorPrincipalId: uuid("actor_principal_id").notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 255 }),
    inputEncrypted: text("input_encrypted").notNull(),
    inputPreviewJson: jsonb("input_preview_json"),
    outputEncrypted: text("output_encrypted"),
    outputPreviewJson: jsonb("output_preview_json"),
    depth: integer("depth").notNull().default(0),
    delegationCount: integer("delegation_count").notNull().default(0),
    reservedTokens: integer("reserved_tokens").notNull().default(0),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    deadlineAt: timestamp("deadline_at", { withTimezone: true }).notNull(),
    leaseOwner: varchar("lease_owner", { length: 255 }),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    cancelRequestedAt: timestamp("cancel_requested_at", { withTimezone: true }),
    errorCode: varchar("error_code", { length: 64 }),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("agent_runs_workspace_created").on(t.workspaceId, t.createdAt),
    index("agent_runs_parent").on(t.parentRunId, t.createdAt),
    index("agent_runs_status_lease").on(t.status, t.leaseExpiresAt),
    uniqueIndex("agent_runs_workspace_trigger_idempotency_unique")
      .on(t.workspaceId, t.trigger, t.idempotencyKey)
      .where(sql`${t.idempotencyKey} is not null`),
  ],
);

export const agentRunSteps = pgTable(
  "agent_run_steps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => agentRuns.id, { onDelete: CASCADE_ACTION }),
    sequence: integer("sequence").notNull(),
    kind: agentRunStepKindEnum("kind").notNull(),
    status: agentRunStatusEnum("status").notNull(),
    name: varchar("name", { length: 255 }),
    childRunId: uuid("child_run_id"),
    inputPreviewJson: jsonb("input_preview_json"),
    outputPreviewJson: jsonb("output_preview_json"),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("agent_run_steps_run_sequence_unique").on(t.runId, t.sequence),
    index("agent_run_steps_child_run").on(t.childRunId),
  ],
);

export const workspaceTokenReservations = pgTable(
  "workspace_token_reservations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: CASCADE_ACTION }),
    runId: uuid("run_id")
      .notNull()
      .references(() => agentRuns.id, { onDelete: CASCADE_ACTION }),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    reservedTokens: integer("reserved_tokens").notNull(),
    actualTokens: integer("actual_tokens"),
    status: tokenReservationStatusEnum("status").notNull().default("active"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("workspace_token_reservations_run_unique").on(t.runId),
    index("workspace_token_reservations_active").on(
      t.workspaceId,
      t.periodStart,
      t.status,
      t.expiresAt,
    ),
  ],
);
