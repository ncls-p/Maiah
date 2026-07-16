ALTER TABLE "ai_providers"
  ADD COLUMN IF NOT EXISTS "openai_compatible_api_route" varchar(32) DEFAULT 'chat-completions' NOT NULL;
--> statement-breakpoint
ALTER TABLE "ai_providers"
  ALTER COLUMN "openai_compatible_api_route" SET DEFAULT 'responses';
