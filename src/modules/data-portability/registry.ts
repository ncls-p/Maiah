import { createHash } from "node:crypto";
import { getTableName, is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import * as schema from "@/server/infrastructure/db/schema-tables";

// Every application table must be reviewed here. New tables fail closed.
export const tableNames = [
  "account",
  "agent_delegation_bindings",
  "agent_knowledge_bindings",
  "agent_run_steps",
  "agent_runs",
  "agent_skill_bindings",
  "agent_skills",
  "agent_tool_bindings",
  "agent_versions",
  "agents",
  "ai_models",
  "ai_providers",
  "app_settings",
  "audit_events",
  "conversation_folders",
  "conversation_read_states",
  "conversation_shares",
  "conversations",
  "custom_tool_credential_refs",
  "custom_tool_secret_requests",
  "custom_tools",
  "document_chunks",
  "document_embeddings",
  "documents",
  "genesys_connections",
  "genesys_deliveries",
  "genesys_projects",
  "genesys_sessions",
  "github_publish_events",
  "knowledge_bases",
  "marketplace_installs",
  "marketplace_item_shares",
  "marketplace_item_versions",
  "marketplace_items",
  "marketplace_ratings",
  "marketplace_reports",
  "marketplace_reviews",
  "mcp_oauth_attempts",
  "mcp_oauth_configs",
  "mcp_oauth_credentials",
  "mcp_servers",
  "mcp_sync_state",
  "mcp_tools",
  "message_parts",
  "messages",
  "organization_builtin_tool_policies",
  "organization_members",
  "organizations",
  "resource_organization_shares",
  "role_bindings",
  "roles",
  "scheduled_tasks",
  "session",
  "team_members",
  "teams",
  "tool_connection_requirements",
  "tool_connections",
  "tool_connectors",
  "tool_invocations",
  "usage_events",
  "usage_limit_charges",
  "usage_limits",
  "user_agent_preferences",
  "user_github_connections",
  "user_github_repositories",
  "user_tool_settings",
  "user_workspace_preferences",
  "user",
  "verification",
  "workflow_agent_input_requests",
  "workflow_agent_messages",
  "workflow_agent_run_requests",
  "workflow_agent_todo_lists",
  "workflow_run_steps",
  "workflow_runs",
  "workflow_versions",
  "workflows",
  "workspace_api_keys",
  "workspace_invitations",
  "workspace_members",
  "workspace_token_reservations",
  "workspaces",
] as const;
export type TableName = (typeof tableNames)[number];
export type Row = Record<string, unknown>;
export type Dataset = Record<TableName, Row[]>;

export const tables = Object.values(schema)
  .filter((value) => is(value, PgTable))
  .map((table) => {
    const config = getTableConfig(table);
    return {
      name: config.name as TableName,
      columns: config.columns.map((column) => ({
        name: column.name,
        type: column.getSQLType(),
        nullable: !column.notNull,
      })),
      primary: [
        ...new Set([
          ...config.columns
            .filter((column) => column.primary)
            .map((column) => column.name),
          ...config.primaryKeys.flatMap((key) =>
            key.columns.map((column) => column.name),
          ),
        ]),
      ],
      references: config.foreignKeys.map((foreignKey) => {
        const reference = foreignKey.reference();
        return {
          columns: reference.columns.map((column) => column.name),
          table: getTableName(reference.foreignTable) as TableName,
          foreignColumns: reference.foreignColumns.map((column) => column.name),
        };
      }),
    };
  })
  .sort((a, b) => a.name.localeCompare(b.name));

export function assertRegistryCoverage() {
  if (
    JSON.stringify(tables.map((table) => table.name).sort()) !==
    JSON.stringify([...tableNames].sort())
  ) {
    throw new Error(
      "Portability registry does not cover the application schema",
    );
  }
}
assertRegistryCoverage();
export const schemaFingerprint = createHash("sha256")
  .update(JSON.stringify(tables))
  .digest("hex");
export function emptyDataset(): Dataset {
  return Object.fromEntries(
    tableNames.map((name) => [name, [] as Row[]]),
  ) as Dataset;
}
export const quote = (identifier: string) =>
  `"${identifier.replaceAll('"', '""')}"`;
