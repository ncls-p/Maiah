import {
	pgTable,
	text,
	integer,
	timestamp,
	boolean,
	varchar,
	uuid,
	jsonb,
	uniqueIndex,
	pgEnum,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./auth";
import { workspaces } from "./workspace";
import { aiProviders } from "./ai-providers";

const CREATED_AT_COLUMN = "created_at";
const UPDATED_AT_COLUMN = "updated_at";
const CASCADE_ACTION = "cascade";
const SET_NULL_ACTION = "set null";
const CREATED_BY_USER_ID_COLUMN = "created_by_user_id";
const WORKSPACE_ID_COLUMN = "workspace_id";
const USER_ID_COLUMN = "user_id";

// ─── Agents ────────────────────────────────────────────────────────────

export const agentVisibilityEnum = pgEnum("agent_visibility", [
	"private",
	"workspace",
	"organization",
	"public",
]);
export const agentSourceTypeEnum = pgEnum("agent_source_type", [
	"custom",
	"marketplace_install",
	"fork",
]);

export const agents = pgTable(
	"agents",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		workspaceId: uuid(WORKSPACE_ID_COLUMN)
			.notNull()
			.references(() => workspaces.id, { onDelete: CASCADE_ACTION }),
		name: varchar("name", { length: 255 }).notNull(),
		slug: varchar("slug", { length: 128 }).notNull(),
		description: text("description"),
		logoUrl: text("logo_url"),
		visibility: agentVisibilityEnum("visibility").notNull().default("private"),
		sourceType: agentSourceTypeEnum("source_type").notNull().default("custom"),
		sharingMode: varchar("sharing_mode", { length: 32 })
			.notNull()
			.default("personal"),
		shareTargetUserId: uuid("share_target_user_id").references(() => users.id, {
			onDelete: SET_NULL_ACTION,
		}),
		isGlobal: boolean("is_global").notNull().default(false),
		isRecommended: boolean("is_recommended").notNull().default(false),
		isOrganizationDefault: boolean("is_organization_default")
			.notNull()
			.default(false),
		organizationDisplayOrder: integer("organization_display_order")
			.notNull()
			.default(0),
		curationLabel: varchar("curation_label", { length: 64 }),
		promptSuggestionsJson: jsonb("prompt_suggestions_json")
			.notNull()
			.default(sql`'[]'::jsonb`),
		marketplaceItemId: uuid("marketplace_item_id"),
		marketplaceVersionId: uuid("marketplace_version_id"),
		forkedFromAgentId: uuid("forked_from_agent_id"),
		createdById: uuid(CREATED_BY_USER_ID_COLUMN)
			.notNull()
			.references(() => users.id),
		activeVersionId: uuid("active_version_id"),
		createdAt: timestamp(CREATED_AT_COLUMN, { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp(UPDATED_AT_COLUMN, { withTimezone: true })
			.notNull()
			.defaultNow(),
		archivedAt: timestamp("archived_at", { withTimezone: true }),
	},
	(t) => [
		uniqueIndex("agents_workspace_slug_unique").on(t.workspaceId, t.slug),
	],
);

export const userAgentPreferences = pgTable(
	"user_agent_preferences",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		workspaceId: uuid(WORKSPACE_ID_COLUMN)
			.notNull()
			.references(() => workspaces.id, { onDelete: CASCADE_ACTION }),
		userId: uuid(USER_ID_COLUMN)
			.notNull()
			.references(() => users.id, { onDelete: CASCADE_ACTION }),
		defaultAgentId: uuid("default_agent_id").references(() => agents.id, {
			onDelete: SET_NULL_ACTION,
		}),
		createdAt: timestamp(CREATED_AT_COLUMN, { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp(UPDATED_AT_COLUMN, { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		uniqueIndex("user_agent_preferences_workspace_user_unique").on(
			t.workspaceId,
			t.userId,
		),
	],
);

export const agentVersions = pgTable(
	"agent_versions",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		agentId: uuid("agent_id").notNull(),
		versionNumber: integer("version_number").notNull(),
		name: varchar("name", { length: 255 }),
		systemPrompt: text("system_prompt"),
		providerId: uuid("provider_id").references(() => aiProviders.id),
		modelId: uuid("model_id"),
		temperature: text("temperature"),
		topP: text("top_p"),
		maxOutputTokens: integer("max_output_tokens"),
		maxToolCalls: integer("max_tool_calls").notNull().default(20),
		toolChoice: varchar("tool_choice", { length: 32 }),
		generationSettingsJson: jsonb("generation_settings_json"),
		responseFormatJson: jsonb("response_format_json"),
		memoryPolicyJson: jsonb("memory_policy_json"),
		guardrailsJson: jsonb("guardrails_json"),
		approvalPolicyJson: jsonb("approval_policy_json"),
		createdById: uuid(CREATED_BY_USER_ID_COLUMN)
			.notNull()
			.references(() => users.id),
		createdAt: timestamp(CREATED_AT_COLUMN, { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		uniqueIndex("agent_versions_agent_version_unique").on(
			t.agentId,
			t.versionNumber,
		),
	],
);
