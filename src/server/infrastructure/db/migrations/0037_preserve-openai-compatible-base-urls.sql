-- OpenAI-compatible base URLs were previously treated as host prefixes and
-- received an implicit /v1 suffix at runtime. Persist that suffix before
-- switching to exact API-prefix semantics so existing connections keep working.
UPDATE "ai_providers"
SET
  "base_url" = regexp_replace("base_url", '/+$', '') || '/v1',
  "updated_at" = now()
WHERE "kind" = 'openai-compatible'
  AND "base_url" IS NOT NULL
  AND btrim("base_url") <> ''
  AND regexp_replace("base_url", '/+$', '') !~ '/v1$';