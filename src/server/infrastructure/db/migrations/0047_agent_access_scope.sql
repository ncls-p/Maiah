INSERT INTO "roles" (
  "scope_type",
  "name",
  "display_name",
  "description",
  "permissions_json",
  "is_system"
)
VALUES (
  'workspace',
  'workspace.agent_user',
  'Assistant User',
  'Can discover, chat with, and test one explicitly shared assistant.',
  '["agents.get","agents.chat","agents.test"]'::jsonb,
  true
)
ON CONFLICT DO NOTHING;
