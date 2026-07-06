import {
  pgTable,
  text,
  integer,
  timestamp,
  varchar,
  uuid,
  jsonb,
  index,
} from "drizzle-orm/pg-core";

const CREATED_AT_COLUMN = "created_at";
const WORKSPACE_ID_COLUMN = "workspace_id";
const USER_ID_COLUMN = "user_id";
const STATUS_COLUMN = "status";

// ─── Usage Events ──────────────────────────────────────────────────────

export const usageEvents = pgTable(
  "usage_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid(WORKSPACE_ID_COLUMN),
    userId: uuid(USER_ID_COLUMN),
    providerId: uuid("provider_id"),
    modelId: uuid("model_id"),
    agentId: uuid("agent_id"),
    conversationId: uuid("conversation_id"),
    operation: varchar("operation", { length: 32 }).notNull(),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    costUsd: text("cost_usd"),
    latencyMs: integer("latency_ms"),
    status: varchar(STATUS_COLUMN, { length: 16 }),
    metadataJson: jsonb("metadata_json"),
    createdAt: timestamp(CREATED_AT_COLUMN, { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("usage_events_workspace").on(t.workspaceId),
    index("usage_events_user").on(t.userId),
  ],
);
