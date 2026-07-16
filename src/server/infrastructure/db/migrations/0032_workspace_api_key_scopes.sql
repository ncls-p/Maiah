ALTER TABLE "workspace_api_keys"
ADD COLUMN "scopes_json" jsonb DEFAULT '[]'::jsonb NOT NULL;

-- Before scoped tokens, only the chat route accepted workspace API keys.
-- Preserve that access without silently granting broader permissions.
UPDATE "workspace_api_keys"
SET "scopes_json" = '["agents.chat"]'::jsonb;
