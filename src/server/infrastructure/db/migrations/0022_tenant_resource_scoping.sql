ALTER TABLE "mcp_servers" ADD COLUMN IF NOT EXISTS "is_global" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "agent_skills" ADD COLUMN IF NOT EXISTS "is_global" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "custom_tools" ADD COLUMN IF NOT EXISTS "is_global" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "knowledge_bases" ADD COLUMN IF NOT EXISTS "is_global" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
INSERT INTO roles (scope_type, name, display_name, description, permissions_json, is_system)
VALUES
  ('workspace', 'workspace.admin', 'Tenant Admin', 'Can administer tenant-wide configuration and global resources.', '["workspaces.get","workspaces.update","roles.manage","providers.manage","providers.viewMetadata","providers.create","providers.update","providers.delete","providers.test","models.manage","models.view","models.create","models.update","models.delete","models.sync","agents.manage","agents.list","agents.get","agents.chat","agents.create","agents.update","agents.delete","agents.test","agentVersions.manage","agentVersions.create","tools.manage","tools.view","tools.configure","tools.executeRestricted","mcpServers.manage","mcpServers.get","knowledgeBases.manage","knowledgeBases.viewAllowed","conversations.manage","conversations.create","conversations.viewOwn","usage.view","audit.view","audit.export","marketplaceItems.view","marketplaceItems.install","marketplaceItems.publish","apiKeys.manage"]'::jsonb, true),
  ('workspace', 'workspace.member', 'Tenant User', 'Can use the tenant and manage only resources they own unless an admin makes a resource global.', '["workspaces.get","agents.list","agents.get","agents.chat","agents.create","agents.update","agents.delete","agents.test","agentVersions.create","tools.view","tools.configure","tools.executeRestricted","mcpServers.get","mcpServers.manage","knowledgeBases.viewAllowed","knowledgeBases.manage","conversations.create","conversations.viewOwn","marketplaceItems.view","marketplaceItems.install","marketplaceItems.publish"]'::jsonb, true)
ON CONFLICT DO NOTHING;
--> statement-breakpoint
WITH workspace_admin_roles AS (
  SELECT id FROM roles WHERE scope_type = 'workspace' AND name = 'workspace.admin' AND is_system = true LIMIT 1
), workspace_member_roles AS (
  SELECT id FROM roles WHERE scope_type = 'workspace' AND name = 'workspace.member' AND is_system = true LIMIT 1
), legacy_admin_bindings AS (
  SELECT rb.id AS binding_id, war.id AS next_role_id
  FROM role_bindings rb
  JOIN roles r ON r.id = rb.role_id
  CROSS JOIN workspace_admin_roles war
  WHERE rb.resource_type = 'workspace'
    AND r.name IN ('workspace.owner', 'workspace.aiAdmin')
), legacy_user_bindings AS (
  SELECT rb.id AS binding_id, wmr.id AS next_role_id
  FROM role_bindings rb
  JOIN roles r ON r.id = rb.role_id
  CROSS JOIN workspace_member_roles wmr
  WHERE rb.resource_type = 'workspace'
    AND r.name IN ('workspace.developer', 'workspace.viewer', 'workspace.auditor', 'workspace.billing')
)
UPDATE role_bindings rb
SET role_id = remap.next_role_id
FROM (
  SELECT * FROM legacy_admin_bindings
  UNION ALL
  SELECT * FROM legacy_user_bindings
) remap
WHERE rb.id = remap.binding_id;
--> statement-breakpoint
UPDATE roles
SET display_name = 'Tenant Admin',
    description = 'Can administer tenant-wide configuration and global resources.',
    permissions_json = '["workspaces.get","workspaces.update","roles.manage","providers.manage","providers.viewMetadata","providers.create","providers.update","providers.delete","providers.test","models.manage","models.view","models.create","models.update","models.delete","models.sync","agents.manage","agents.list","agents.get","agents.chat","agents.create","agents.update","agents.delete","agents.test","agentVersions.manage","agentVersions.create","tools.manage","tools.view","tools.configure","tools.executeRestricted","mcpServers.manage","mcpServers.get","knowledgeBases.manage","knowledgeBases.viewAllowed","conversations.manage","conversations.create","conversations.viewOwn","usage.view","audit.view","audit.export","marketplaceItems.view","marketplaceItems.install","marketplaceItems.publish","apiKeys.manage"]'::jsonb,
    updated_at = now()
WHERE scope_type = 'workspace' AND name = 'workspace.admin' AND is_system = true;
--> statement-breakpoint
UPDATE roles
SET display_name = 'Tenant User',
    description = 'Can use the tenant and manage only resources they own unless an admin makes a resource global.',
    permissions_json = '["workspaces.get","agents.list","agents.get","agents.chat","agents.create","agents.update","agents.delete","agents.test","agentVersions.create","tools.view","tools.configure","tools.executeRestricted","mcpServers.get","mcpServers.manage","knowledgeBases.viewAllowed","knowledgeBases.manage","conversations.create","conversations.viewOwn","marketplaceItems.view","marketplaceItems.install","marketplaceItems.publish"]'::jsonb,
    updated_at = now()
WHERE scope_type = 'workspace' AND name = 'workspace.member' AND is_system = true;
--> statement-breakpoint
UPDATE roles
SET permissions_json = '[]'::jsonb,
    description = COALESCE(description, '') || ' (legacy role disabled; remapped to tenant admin/user).',
    updated_at = now()
WHERE scope_type = 'workspace'
  AND name IN ('workspace.owner', 'workspace.aiAdmin', 'workspace.developer', 'workspace.viewer', 'workspace.auditor', 'workspace.billing')
  AND is_system = true;
