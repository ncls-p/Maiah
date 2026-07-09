DO $$ BEGIN
  CREATE TYPE "tool_connector_kind" AS ENUM ('mcp', 'builtin', 'custom');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "tool_connection_owner_type" AS ENUM ('user', 'workspace');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "tool_connection_status" AS ENUM ('active', 'invalid', 'expired', 'disabled');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tool_connectors" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "created_by_user_id" uuid NOT NULL,
  "key" varchar(128) NOT NULL,
  "name" varchar(255) NOT NULL,
  "description" text,
  "kind" "tool_connector_kind" NOT NULL,
  "mcp_server_id" uuid,
  "config_schema_json" jsonb,
  "secret_schema_json" jsonb,
  "default_config_json" jsonb,
  "enabled" boolean DEFAULT true NOT NULL,
  "is_global" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tool_connections" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "connector_id" uuid NOT NULL,
  "owner_type" "tool_connection_owner_type" NOT NULL,
  "owner_user_id" uuid,
  "label" varchar(255) NOT NULL,
  "config_json" jsonb,
  "encrypted_secrets_json" jsonb,
  "is_default" boolean DEFAULT false NOT NULL,
  "status" "tool_connection_status" DEFAULT 'active' NOT NULL,
  "last_validated_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "archived_at" timestamp with time zone,
  CONSTRAINT "tool_connections_owner_check" CHECK (
    ("owner_type" = 'workspace' AND "owner_user_id" IS NULL)
    OR ("owner_type" = 'user' AND "owner_user_id" IS NOT NULL)
  )
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tool_connection_requirements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "connector_id" uuid NOT NULL,
  "tool_source" varchar(16) NOT NULL,
  "tool_id" varchar(255) NOT NULL,
  "required" boolean DEFAULT true NOT NULL,
  "config_schema_json" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_tool_settings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "tool_source" varchar(16) NOT NULL,
  "tool_id" varchar(255) NOT NULL,
  "connection_id" uuid,
  "config_json" jsonb,
  "encrypted_secrets_json" jsonb,
  "enabled" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "tool_connectors"
    ADD CONSTRAINT "tool_connectors_workspace_id_workspaces_id_fk"
    FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "tool_connectors"
    ADD CONSTRAINT "tool_connectors_created_by_user_id_users_id_fk"
    FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "tool_connectors"
    ADD CONSTRAINT "tool_connectors_mcp_server_id_mcp_servers_id_fk"
    FOREIGN KEY ("mcp_server_id") REFERENCES "public"."mcp_servers"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "tool_connections"
    ADD CONSTRAINT "tool_connections_workspace_id_workspaces_id_fk"
    FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "tool_connections"
    ADD CONSTRAINT "tool_connections_connector_id_tool_connectors_id_fk"
    FOREIGN KEY ("connector_id") REFERENCES "public"."tool_connectors"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "tool_connections"
    ADD CONSTRAINT "tool_connections_owner_user_id_users_id_fk"
    FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "tool_connection_requirements"
    ADD CONSTRAINT "tool_connection_requirements_workspace_id_workspaces_id_fk"
    FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "tool_connection_requirements"
    ADD CONSTRAINT "tool_connection_requirements_connector_id_tool_connectors_id_fk"
    FOREIGN KEY ("connector_id") REFERENCES "public"."tool_connectors"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "user_tool_settings"
    ADD CONSTRAINT "user_tool_settings_workspace_id_workspaces_id_fk"
    FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "user_tool_settings"
    ADD CONSTRAINT "user_tool_settings_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "user_tool_settings"
    ADD CONSTRAINT "user_tool_settings_connection_id_tool_connections_id_fk"
    FOREIGN KEY ("connection_id") REFERENCES "public"."tool_connections"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tool_connectors_workspace" ON "tool_connectors" USING btree ("workspace_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tool_connectors_mcp_server" ON "tool_connectors" USING btree ("mcp_server_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tool_connectors_workspace_key_unique" ON "tool_connectors" USING btree ("workspace_id", "key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tool_connections_workspace" ON "tool_connections" USING btree ("workspace_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tool_connections_connector" ON "tool_connections" USING btree ("connector_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tool_connections_owner_user" ON "tool_connections" USING btree ("owner_user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tool_connection_requirements_workspace" ON "tool_connection_requirements" USING btree ("workspace_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tool_connection_requirements_connector" ON "tool_connection_requirements" USING btree ("connector_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tool_connection_requirements_tool_unique" ON "tool_connection_requirements" USING btree ("workspace_id", "tool_source", "tool_id", "connector_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_tool_settings_workspace" ON "user_tool_settings" USING btree ("workspace_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_tool_settings_user" ON "user_tool_settings" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_tool_settings_connection" ON "user_tool_settings" USING btree ("connection_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_tool_settings_tool_unique" ON "user_tool_settings" USING btree ("workspace_id", "user_id", "tool_source", "tool_id");
