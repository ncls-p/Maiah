UPDATE roles
SET permissions_json = (
  SELECT jsonb_agg(permission ORDER BY permission)
  FROM (
    SELECT jsonb_array_elements_text(permissions_json) AS permission
    UNION
    SELECT permission
    FROM (
      VALUES
        ('providers.viewMetadata'),
        ('models.view'),
        ('apiKeys.manageOwn')
    ) AS extra(permission)
  ) AS merged_permissions
)
WHERE scope_type = 'workspace'
  AND name = 'workspace.member'
  AND is_system = true;
