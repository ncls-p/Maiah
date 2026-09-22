import {
  emptyDataset,
  tables,
  type Dataset,
  type Row,
  type TableName,
} from "./registry";
import { configurationReferences } from "./config-references";

const ownedBy: Partial<Record<TableName, [string, TableName, string?]>> = {
  account: ["user_id", "user"],
  session: ["user_id", "user"],
  agent_versions: ["agent_id", "agents"],
  agent_delegation_bindings: ["agent_version_id", "agent_versions"],
  agent_knowledge_bindings: ["agent_version_id", "agent_versions"],
  agent_skill_bindings: ["agent_version_id", "agent_versions"],
  agent_tool_bindings: ["agent_version_id", "agent_versions"],
  agent_run_steps: ["run_id", "agent_runs"],
  ai_models: ["provider_id", "ai_providers"],
  conversation_read_states: ["conversation_id", "conversations"],
  conversation_shares: ["conversation_id", "conversations"],
  messages: ["conversation_id", "conversations"],
  message_parts: ["message_id", "messages"],
  document_chunks: ["document_id", "documents"],
  document_embeddings: ["chunk_id", "document_chunks"],
  genesys_deliveries: ["session_id", "genesys_sessions"],
  marketplace_item_versions: ["item_id", "marketplace_items"],
  marketplace_item_shares: ["item_id", "marketplace_items"],
  marketplace_ratings: ["item_id", "marketplace_items"],
  marketplace_reports: ["item_id", "marketplace_items"],
  marketplace_reviews: ["item_id", "marketplace_items"],
  mcp_oauth_configs: ["server_id", "mcp_servers"],
  mcp_oauth_credentials: ["server_id", "mcp_servers"],
  mcp_oauth_attempts: ["server_id", "mcp_servers"],
  mcp_sync_state: ["server_id", "mcp_servers"],
  mcp_tools: ["mcp_server_id", "mcp_servers"],
  team_members: ["team_id", "teams"],
  usage_limit_charges: ["limit_id", "usage_limits"],
  user_github_connections: ["user_id", "user"],
  user_github_repositories: ["connection_id", "user_github_connections"],
  user_workspace_preferences: ["active_workspace_id", "workspaces"],
  workflow_versions: ["workflow_id", "workflows"],
  workflow_run_steps: ["run_id", "workflow_runs"],
};
const softReferences: Record<string, TableName> = {
  agent_id: "agents",
  agent_version_id: "agent_versions",
  active_version_id: "agent_versions",
  provider_id: "ai_providers",
  model_id: "ai_models",
  approved_by_user_id: "user",
  conversation_id: "conversations",
  message_id: "messages",
  workflow_id: "workflows",
  workflow_version_id: "workflow_versions",
  user_id: "user",
  billing_workspace_id: "workspaces",
  marketplace_item_id: "marketplace_items",
  marketplace_version_id: "marketplace_item_versions",
  parent_conversation_id: "conversations",
  forked_from_agent_id: "agents",
  child_run_id: "agent_runs",
  root_run_id: "agent_runs",
};
const resourceTables: Record<string, TableName> = {
  organization: "organizations",
  workspace: "workspaces",
  agent: "agents",
  knowledge_base: "knowledge_bases",
  workflow: "workflows",
  custom_tool: "custom_tools",
  mcp_server: "mcp_servers",
  mcp_tool: "mcp_tools",
  skill: "agent_skills",
  provider: "ai_providers",
  ai_provider: "ai_providers",
  tool_connection: "tool_connections",
  marketplace_item: "marketplace_items",
  team: "teams",
  user: "user",
};

/** Explicit ownership traversal; users never pull in their other memberships/workspaces. */
export function selectOrganization(
  source: Dataset,
  organizationId: string,
): Dataset {
  const result = emptyDataset();
  const selected = new Map(tables.map((table) => [table.name, new Set<Row>()]));
  const workspaceIds = new Set(
    source.workspaces
      .filter((row) => row.organization_id === organizationId)
      .map((row) => row.id),
  );
  function add(name: TableName, row: Row) {
    if (selected.get(name)!.has(row)) return false;
    if (
      (name === "organizations" && row.id !== organizationId) ||
      (name === "workspaces" && !workspaceIds.has(row.id)) ||
      (row.organization_id && row.organization_id !== organizationId) ||
      (row.workspace_id && !workspaceIds.has(row.workspace_id))
    )
      throw new Error(
        `Cross-organization dependency in ${name}; use an instance export instead`,
      );
    selected.get(name)!.add(row);
    result[name].push(row);
    return true;
  }
  function addId(name: TableName, id: unknown) {
    if (!id) return false;
    const row = source[name].find((candidate) => candidate.id === id);
    return row ? add(name, row) : false;
  }
  function hasId(name: TableName, id: unknown) {
    return id != null && result[name].some((row) => row.id === id);
  }
  if (!addId("organizations", organizationId))
    throw new Error("Organization not found");
  for (const table of tables)
    for (const row of source[table.name]) {
      if (
        row.organization_id === organizationId ||
        workspaceIds.has(row.workspace_id) ||
        (table.name === "workspaces" && workspaceIds.has(row.id)) ||
        (table.name === "marketplace_items" &&
          workspaceIds.has(row.publisher_workspace_id)) ||
        (table.name === "app_settings" &&
          typeof row.key === "string" &&
          (row.key.endsWith(`:organization:${organizationId}`) ||
            row.key === `microsoft-sso:${organizationId}`))
      )
        add(table.name, row);
    }
  let changed = true;
  while (changed) {
    changed = false;
    for (const table of tables) {
      const owner = ownedBy[table.name];
      for (const row of source[table.name]) {
        if (owner && hasId(owner[1], row[owner[0]]))
          changed = add(table.name, row) || changed;
        if (
          table.name === "app_settings" &&
          typeof row.key === "string" &&
          ((row.key.startsWith("generation:") &&
            hasId("agent_versions", row.key.split(":")[1])) ||
            (row.key.startsWith("onboarding.complete:") &&
              hasId("user", row.key.split(":")[1])))
        )
          changed = add(table.name, row) || changed;
        if (
          table.name === "roles" &&
          (row.owner_resource_id === organizationId ||
            workspaceIds.has(row.owner_resource_id))
        )
          changed = add(table.name, row) || changed;
        if (
          table.name === "role_bindings" &&
          resourceTables[String(row.resource_type)] &&
          hasId(resourceTables[String(row.resource_type)], row.resource_id)
        )
          changed = add(table.name, row) || changed;
        if (
          table.name === "usage_limits" &&
          resourceTables[String(row.subject_type)] &&
          hasId(resourceTables[String(row.subject_type)], row.subject_id)
        )
          changed = add(table.name, row) || changed;
      }
      for (const row of [...result[table.name]]) {
        for (const reference of table.references) {
          if (reference.columns.some((column) => row[column] == null)) continue;
          const parent = source[reference.table].find((candidate) =>
            reference.columns.every(
              (column, i) =>
                candidate[reference.foreignColumns[i]] === row[column],
            ),
          );
          if (!parent)
            throw new Error(
              `Missing reference from ${table.name} to ${reference.table}`,
            );
          changed = add(reference.table, parent) || changed;
        }
        for (const [column, parent] of Object.entries(softReferences))
          if (row[column] != null)
            changed = addId(parent, row[column]) || changed;
        changed = configurationReferences(row, addId) || changed;
        if (table.name === "resource_organization_shares")
          for (const prefix of ["", "root_"]) {
            const parent =
              resourceTables[String(row[`${prefix}resource_type`])];
            if (!parent) throw new Error("Unknown shared resource type");
            changed = addId(parent, row[`${prefix}resource_id`]) || changed;
          }
        if (
          table.name === "marketplace_items" &&
          resourceTables[String(row.source_resource_type)]
        )
          changed =
            addId(
              resourceTables[String(row.source_resource_type)],
              row.source_resource_id,
            ) || changed;
        const toolTable =
          row.tool_source === "mcp"
            ? "mcp_tools"
            : row.tool_source === "custom"
              ? "custom_tools"
              : null;
        if (toolTable) changed = addId(toolTable, row.tool_id) || changed;
      }
    }
  }
  // Global settings, verification challenges and unrelated platform grants stay outside an org archive.
  return result;
}
