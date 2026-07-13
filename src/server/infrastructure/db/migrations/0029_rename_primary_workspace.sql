UPDATE "workspaces"
SET
  "name" = 'Maiah',
  "updated_at" = now()
WHERE
  "slug" = 'main'
  AND "name" = concat('AI', chr(32), 'Hub');
