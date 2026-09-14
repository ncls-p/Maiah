-- Promote the latest project choice to its organization once. Existing organization
-- choices win, and choices never cross an organization boundary.
INSERT INTO app_settings (key, value_json, updated_by_user_id, updated_at)
SELECT DISTINCT ON (w.organization_id)
  'workflowBuilder:organization:' || w.organization_id::text,
  s.value_json, s.updated_by_user_id, s.updated_at
FROM app_settings s
JOIN workspaces w ON s.key = 'workflowBuilder:' || w.id::text
WHERE w.archived_at IS NULL AND w.organization_id IS NOT NULL
ORDER BY w.organization_id, s.updated_at DESC, w.id
ON CONFLICT (key) DO NOTHING;
