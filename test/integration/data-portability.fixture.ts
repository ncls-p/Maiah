import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import type { PortabilityContext } from "@/modules/data-portability/service";
import type { Row, TableName } from "@/modules/data-portability/registry";
import { seedPortableContent } from "./data-portability-content.fixture";

export async function seedPortability(context: PortabilityContext) {
  const id = Object.fromEntries(
    [
      "user",
      "otherUser",
      "org",
      "otherOrg",
      "workspace",
      "otherWorkspace",
      "provider",
      "model",
      "agent",
      "version",
      "server",
      "tool",
      "connector",
      "connection",
      "conversation",
      "message",
      "document",
      "chunk",
      "knowledge",
      "workflow",
      "workflowVersion",
      "workflowRun",
      "task",
      "run",
      "limit",
      "attachment",
      "code",
    ].map((name) => [name, randomUUID()]),
  );
  const dialect = new PgDialect();
  const insert = async (name: TableName, row: Row) => {
    const target = sql`public.${sql.identifier(name)}`;
    const columns = sql.join(
      Object.keys(row).map((key) => sql.identifier(key)),
      sql`, `,
    );
    const query = dialect.sqlToQuery(
      sql`insert into ${target} (${columns}) select ${columns} from jsonb_populate_record(null::${target}, ${JSON.stringify(row)}::jsonb)`,
    );
    await context.pool.query(query.sql, query.params);
  };
  const secret = await context.secrets.encrypt("portable-secret-not-for-logs");
  const now = new Date().toISOString(),
    future = "2099-01-01T00:00:00.000Z";
  await insert("user", {
    id: id.user,
    email: "migration@example.test",
    name: "Migration",
    role: "admin",
    email_verified: true,
  });
  await insert("user", {
    id: id.otherUser,
    email: "unrelated@example.test",
    name: "Other tenant",
  });
  await insert("account", {
    id: randomUUID(),
    account_id: id.user,
    provider_id: "credential",
    user_id: id.user,
    password: "password-hash-preserved",
    access_token: "oauth-access-token",
    refresh_token: "oauth-refresh-token",
  });
  await insert("account", {
    id: randomUUID(),
    account_id: "microsoft-identity",
    provider_id: "microsoft",
    user_id: id.user,
    access_token: await context.authTokens.encrypt("microsoft-access-token"),
    refresh_token: await context.authTokens.encrypt("microsoft-refresh-token"),
  });
  await insert("session", {
    id: randomUUID(),
    user_id: id.user,
    token: "old-session-token",
    expires_at: future,
  });
  await insert("verification", {
    id: randomUUID(),
    identifier: "challenge",
    value: "sensitive-challenge",
    expires_at: future,
  });
  await insert("organizations", {
    id: id.org,
    name: "Portable",
    slug: "portable",
  });
  await insert("organizations", {
    id: id.otherOrg,
    name: "Unrelated",
    slug: "unrelated",
  });
  await insert("workspaces", {
    id: id.workspace,
    organization_id: id.org,
    created_by_user_id: id.user,
    name: "Portable",
    slug: "portable",
  });
  await insert("workspaces", {
    id: id.otherWorkspace,
    organization_id: id.otherOrg,
    created_by_user_id: id.otherUser,
    name: "Unrelated",
    slug: "unrelated",
  });
  await insert("organization_members", {
    organization_id: id.org,
    user_id: id.user,
  });
  await insert("organization_members", {
    organization_id: id.otherOrg,
    user_id: id.user,
  });
  await insert("workspace_members", {
    workspace_id: id.workspace,
    user_id: id.user,
  });
  await insert("app_settings", {
    key: `companion:organization:${id.org}`,
    value_json: { enabled: true },
  });
  await insert("ai_providers", {
    id: id.provider,
    workspace_id: id.workspace,
    name: "Portable provider",
    kind: "openai-compatible",
    auth_type: "bearer",
    encrypted_api_key: secret,
    created_by_user_id: id.user,
  });
  await insert("ai_models", {
    id: id.model,
    provider_id: id.provider,
    model_id: "portable-model",
    display_name: "Portable model",
  });
  await insert("agents", {
    id: id.agent,
    workspace_id: id.workspace,
    name: "Assistant",
    slug: "assistant",
    created_by_user_id: id.user,
    active_version_id: id.version,
  });
  await insert("agent_versions", {
    id: id.version,
    agent_id: id.agent,
    version_number: 1,
    name: "Assistant",
    system_prompt: "Private instructions",
    provider_id: id.provider,
    model_id: id.model,
    created_by_user_id: id.user,
  });
  await insert("mcp_servers", {
    id: id.server,
    workspace_id: id.workspace,
    name: "Portable MCP",
    transport: "streamable-http",
    url: "https://mcp.example.test",
    encrypted_headers_json: secret,
    created_by_user_id: id.user,
  });
  await insert("mcp_tools", {
    id: id.tool,
    mcp_server_id: id.server,
    name: "portable-tool",
    input_schema_json: { type: "object" },
  });
  await insert("mcp_oauth_configs", {
    server_id: id.server,
    client_id: "portable-client",
    encrypted_client_secret: secret,
  });
  await insert("mcp_oauth_credentials", {
    server_id: id.server,
    user_id: id.user,
    encrypted_data: secret,
  });
  await insert("mcp_oauth_attempts", {
    state_hash: "pending-oauth",
    server_id: id.server,
    user_id: id.user,
    workspace_id: id.workspace,
    encrypted_data: secret,
    expires_at: future,
  });
  await insert("tool_connectors", {
    id: id.connector,
    workspace_id: id.workspace,
    created_by_user_id: id.user,
    key: "portable",
    name: "Connector",
    kind: "mcp",
    mcp_server_id: id.server,
  });
  await insert("tool_connections", {
    id: id.connection,
    workspace_id: id.workspace,
    connector_id: id.connector,
    owner_type: "user",
    owner_user_id: id.user,
    label: "Connection",
    encrypted_secrets_json: secret,
  });
  await insert("user_tool_settings", {
    workspace_id: id.workspace,
    user_id: id.user,
    tool_source: "mcp",
    tool_id: id.tool,
    connection_id: id.connection,
    encrypted_secrets_json: secret,
  });
  await insert("agent_tool_bindings", {
    agent_version_id: id.version,
    tool_source: "mcp",
    tool_id: id.tool,
    connection_ids: [id.connection],
  });
  await insert("workspace_api_keys", {
    workspace_id: id.workspace,
    name: "API token",
    key_prefix: "maiah_test",
    key_hash: "api-key-hash-preserved",
    created_by_user_id: id.user,
    scopes_json: { permissions: ["agents.use"] },
  });
  await seedPortableContent(context, id, insert, secret, now, future);
  return id;
}
