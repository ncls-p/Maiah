ALTER TABLE "agents"
	ADD COLUMN IF NOT EXISTS "is_organization_default" boolean NOT NULL DEFAULT false;

ALTER TABLE "agents"
	ADD COLUMN IF NOT EXISTS "organization_display_order" integer NOT NULL DEFAULT 0;

ALTER TABLE "agents"
	ADD COLUMN IF NOT EXISTS "prompt_suggestions_json" jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS "agents_workspace_organization_order_idx"
	ON "agents" ("workspace_id", "is_global", "organization_display_order", "updated_at", "id");

CREATE TABLE IF NOT EXISTS "user_agent_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE cascade,
	"user_id" uuid NOT NULL REFERENCES "user"("id") ON DELETE cascade,
	"default_agent_id" uuid REFERENCES "agents"("id") ON DELETE set null,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "user_agent_preferences_workspace_user_unique"
	ON "user_agent_preferences" ("workspace_id", "user_id");

CREATE INDEX IF NOT EXISTS "user_agent_preferences_default_agent_idx"
	ON "user_agent_preferences" ("default_agent_id");
