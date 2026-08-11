-- Backfill scope-derived access grants for assistants that were already shared
-- before dependency bundles were introduced. Credentials/tool connections are
-- intentionally excluded and remain personal to each user.
WITH RECURSIVE scoped_roots AS (
  SELECT
    a.id AS root_agent_id,
    a.active_version_id AS version_id,
    a.created_by_user_id,
    CASE
      WHEN a.visibility = 'workspace' THEN a.workspace_id
      ELSE w.organization_id
    END AS principal_id
  FROM agents a
  INNER JOIN workspaces w ON w.id = a.workspace_id
  WHERE a.archived_at IS NULL
    AND a.active_version_id IS NOT NULL
    AND a.visibility IN ('workspace', 'organization')
  UNION
  SELECT
    a.id AS root_agent_id,
    a.active_version_id AS version_id,
    a.created_by_user_id,
    binding.principal_id
  FROM agents a
  INNER JOIN role_bindings binding
    ON binding.resource_type = 'agent'::role_binding_resource_type
    AND binding.resource_id = a.id
    AND binding.principal_type = 'group'::principal_type
  INNER JOIN roles role
    ON role.id = binding.role_id
    AND role.name = 'workspace.agent_user'
  WHERE a.archived_at IS NULL
    AND a.active_version_id IS NOT NULL
), agent_graph AS (
  SELECT
    root_agent_id,
    created_by_user_id,
    principal_id,
    root_agent_id AS agent_id,
    version_id
  FROM scoped_roots
  UNION
  SELECT
    graph.root_agent_id,
    graph.created_by_user_id,
    graph.principal_id,
    delegation.child_agent_id,
    delegation.child_agent_version_id
  FROM agent_graph graph
  INNER JOIN agent_delegation_bindings delegation
    ON delegation.agent_version_id = graph.version_id
), targets AS (
  SELECT root_agent_id, created_by_user_id, principal_id, 'agent'::role_binding_resource_type AS resource_type, agent_id AS resource_id
  FROM agent_graph
  UNION
  SELECT graph.root_agent_id, graph.created_by_user_id, graph.principal_id, 'provider'::role_binding_resource_type, version.provider_id
  FROM agent_graph graph
  INNER JOIN agent_versions version ON version.id = graph.version_id
  WHERE version.provider_id IS NOT NULL
  UNION
  SELECT graph.root_agent_id, graph.created_by_user_id, graph.principal_id, 'model'::role_binding_resource_type, version.model_id
  FROM agent_graph graph
  INNER JOIN agent_versions version ON version.id = graph.version_id
  WHERE version.model_id IS NOT NULL
  UNION
  SELECT graph.root_agent_id, graph.created_by_user_id, graph.principal_id, 'knowledge_base'::role_binding_resource_type, binding.knowledge_base_id
  FROM agent_graph graph
  INNER JOIN agent_knowledge_bindings binding ON binding.agent_version_id = graph.version_id
  UNION
  SELECT graph.root_agent_id, graph.created_by_user_id, graph.principal_id, 'skill'::role_binding_resource_type, binding.skill_id
  FROM agent_graph graph
  INNER JOIN agent_skill_bindings binding ON binding.agent_version_id = graph.version_id
  UNION
  SELECT graph.root_agent_id, graph.created_by_user_id, graph.principal_id, 'custom_tool'::role_binding_resource_type, binding.tool_id
  FROM agent_graph graph
  INNER JOIN agent_tool_bindings binding ON binding.agent_version_id = graph.version_id
  WHERE binding.tool_source = 'custom'
  UNION
  SELECT graph.root_agent_id, graph.created_by_user_id, graph.principal_id, 'mcp_server'::role_binding_resource_type, tool.mcp_server_id
  FROM agent_graph graph
  INNER JOIN agent_tool_bindings binding ON binding.agent_version_id = graph.version_id
  INNER JOIN mcp_tools tool ON tool.id = binding.tool_id
  WHERE binding.tool_source = 'mcp'
), sharing_roles AS (
  SELECT id, name
  FROM roles
  WHERE is_system = true
    AND scope_type = 'workspace'
    AND name IN ('workspace.agent_user', 'workspace.viewer')
)
INSERT INTO role_bindings (
  principal_type,
  principal_id,
  role_id,
  resource_type,
  resource_id,
  condition_json,
  created_by_user_id
)
SELECT
  'group'::principal_type,
  target.principal_id,
  role.id,
  target.resource_type,
  target.resource_id,
  jsonb_build_object('source', 'agent_scope', 'rootAgentId', target.root_agent_id),
  target.created_by_user_id
FROM targets target
INNER JOIN sharing_roles role
  ON role.name = CASE
    WHEN target.resource_type = 'agent'::role_binding_resource_type
      THEN 'workspace.agent_user'
    ELSE 'workspace.viewer'
  END
ON CONFLICT DO NOTHING;
