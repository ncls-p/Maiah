import type { Row, TableName } from "./registry";

const referenceKeys: Record<string, TableName> = {
  agentId: "agents",
  childAgentId: "agents",
  agentVersionId: "agent_versions",
  providerId: "ai_providers",
  modelId: "ai_models",
  modelDbId: "ai_models",
  knowledgeBaseId: "knowledge_bases",
  mcpServerId: "mcp_servers",
  connectorId: "tool_connectors",
  connectionId: "tool_connections",
  connectionIds: "tool_connections",
  customToolId: "custom_tools",
  skillId: "agent_skills",
  workflowId: "workflows",
  workspaceId: "workspaces",
  organizationId: "organizations",
  roleId: "roles",
  roleIds: "roles",
};
// Do not infer dependencies from free-form message/tool output or arbitrary UUID text.
const configurationColumns = [
  "definition_json",
  "rag_config_json",
  "generation_settings_json",
  "orchestration_policy_json",
  "manifest_json",
  "value_json",
];
export function configurationReferences(
  row: Row,
  add: (table: TableName, id: unknown) => boolean,
): boolean {
  let changed = false;
  function visit(value: unknown, depth: number) {
    if (depth > 100) throw new Error("Configuration nesting limit exceeded");
    if (Array.isArray(value)) {
      value.forEach((entry) => visit(entry, depth + 1));
      return;
    }
    if (!value || typeof value !== "object") return;
    for (const [key, entry] of Object.entries(value)) {
      const table = referenceKeys[key];
      if (table)
        for (const id of Array.isArray(entry) ? entry : [entry]) {
          if (typeof id === "string") changed = add(table, id) || changed;
        }
      visit(entry, depth + 1);
    }
  }
  for (const column of configurationColumns) visit(row[column], 0);
  for (const id of Array.isArray(row.connection_ids) ? row.connection_ids : [])
    changed = add("tool_connections", id) || changed;
  for (const prefix of ["", "actor_"]) {
    const kind = row[`${prefix}principal_type`];
    const table =
      kind === "user"
        ? "user"
        : kind === "group"
          ? "teams"
          : kind === "api_key"
            ? "workspace_api_keys"
            : null;
    if (table) changed = add(table, row[`${prefix}principal_id`]) || changed;
  }
  return changed;
}
