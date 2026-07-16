UPDATE "roles"
SET
  "permissions_json" = CASE
    WHEN "permissions_json" @> '["models.invoke"]'::jsonb THEN "permissions_json"
    ELSE "permissions_json" || '["models.invoke"]'::jsonb
  END,
  "updated_at" = now()
WHERE
  "scope_type" = 'workspace'
  AND "is_system" = true
  AND "name" IN ('workspace.admin', 'workspace.member');
