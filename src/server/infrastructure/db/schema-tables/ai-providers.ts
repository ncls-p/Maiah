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

const CREATED_AT_COLUMN = "created_at";
const UPDATED_AT_COLUMN = "updated_at";
const CASCADE_ACTION = "cascade";
const CREATED_BY_USER_ID_COLUMN = "created_by_user_id";
const WORKSPACE_ID_COLUMN = "workspace_id";

// ─── AI Providers ──────────────────────────────────────────────────────

export const providerKindEnum = pgEnum("provider_kind", [
  "openai-compatible",
  "dragonfly",
  "vercel-ai-gateway",
  "native",
]);
export const providerAuthTypeEnum = pgEnum("provider_auth_type", [
  "bearer",
  "x-api-key",
  "custom-header",
  "gateway",
]);

export const aiProviders = pgTable(
  "ai_providers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid(WORKSPACE_ID_COLUMN)
      .notNull()
      .references(() => workspaces.id, { onDelete: CASCADE_ACTION }),
    kind: providerKindEnum("kind").notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    baseUrl: text("base_url"),
    authType: providerAuthTypeEnum("auth_type").notNull(),
    encryptedApiKey: text("encrypted_api_key"),
    encryptedHeadersJson: jsonb("encrypted_headers_json"),
    queryParamsJson: jsonb("query_params_json"),
    openaiCompatibleApiRoute: varchar("openai_compatible_api_route", {
      length: 32,
    })
      .notNull()
      .default("responses"),
    enabled: boolean("enabled").notNull().default(true),
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
  (t) => [index("ai_providers_workspace").on(t.workspaceId)],
);

export const aiModels = pgTable(
  "ai_models",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerId: uuid("provider_id")
      .notNull()
      .references(() => aiProviders.id, { onDelete: CASCADE_ACTION }),
    modelId: varchar("model_id", { length: 255 }).notNull(),
    displayName: varchar("display_name", { length: 255 }),
    logoUrl: text("logo_url"),
    capabilitiesJson: jsonb("capabilities_json"),
    contextWindow: integer("context_window"),
    maxOutputTokens: integer("max_output_tokens"),
    inputTokenCost: text("input_token_cost"),
    outputTokenCost: text("output_token_cost"),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp(CREATED_AT_COLUMN, { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp(UPDATED_AT_COLUMN, { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("ai_models_provider_model_unique").on(t.providerId, t.modelId),
  ],
);
