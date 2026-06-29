ALTER TABLE "user_github_connections" ADD COLUMN IF NOT EXISTS "repository_selection" varchar(32);
--> statement-breakpoint
ALTER TABLE "user_github_connections" ADD COLUMN IF NOT EXISTS "settings_url" text;
--> statement-breakpoint
ALTER TABLE "user_github_connections" ADD COLUMN IF NOT EXISTS "last_synced_at" timestamp with time zone DEFAULT now() NOT NULL;
