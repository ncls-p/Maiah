CREATE TABLE IF NOT EXISTS "organization_builtin_tool_policies" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "tool_name" varchar(255) NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "require_approval" boolean DEFAULT false NOT NULL,
  "updated_by_user_id" uuid REFERENCES "user"("id") ON DELETE set null,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "organization_builtin_tool_policies_org_tool_unique"
  ON "organization_builtin_tool_policies" ("organization_id", "tool_name");
