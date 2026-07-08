# Tool connections and ServiceNow MCP gateway

Maiah now separates **tool definitions** from **per-user connection data**.

## Data model

- `tool_connectors`: integration templates such as `servicenow`, `jira`, `github`.
- `tool_connections`: user-owned or workspace-owned connection instances with non-secret `config_json` and encrypted `encrypted_secrets_json`.
- `tool_connection_requirements`: optional mapping from one tool to the connector it requires.
- `user_tool_settings`: user-specific per-tool overrides, selected connection, and optional per-tool secrets.

This allows the same MCP server and tool catalogue to be shared while each user keeps their own endpoint, credentials, and tool preferences.

## ServiceNow pattern

1. Deploy `services/servicenow-mcp-gateway` as a separate service.
2. Set the same HMAC secret in both services:
   - Maiah: `MCP_GATEWAY_SHARED_SECRET`
   - Gateway: `MAIAH_MCP_GATEWAY_SHARED_SECRET` or `MCP_GATEWAY_SHARED_SECRET`
3. Register the gateway once in Maiah as an MCP server:

```txt
transport: sse
url: https://<servicenow-gateway>/sse
```

1. Create a global connector linked to that MCP server:

```json
{
  "key": "servicenow",
  "name": "ServiceNow",
  "kind": "mcp",
  "mcpServerId": "<mcp-server-id>",
  "configSchema": {
    "instanceUrl": { "type": "string", "format": "uri" },
    "authType": { "type": "string", "enum": ["basic", "oauth", "api_key"] }
  },
  "secretSchema": {
    "username": { "type": "string" },
    "password": { "type": "password" }
  },
  "isGlobal": true
}
```

1. Each user creates a `tool_connection`:

```json
{
  "connectorId": "<servicenow-connector-id>",
  "label": "ServiceNow Prod",
  "config": {
    "instanceUrl": "https://customer.service-now.com",
    "authType": "basic"
  },
  "secrets": {
    "username": "user.name",
    "password": "..."
  },
  "isDefault": true
}
```

At tool execution time, Maiah resolves the current user's connection, decrypts the secrets, creates a short-lived AES-GCM encrypted + HMAC-signed context, and sends it as MCP request headers to the gateway. The gateway validates the signature, decrypts the context in memory, and enforces URL policy before constructing the ServiceNow MCP session.

## Security notes

- User secrets stay encrypted at rest in Maiah and are never sent as plaintext headers or stored by the gateway.
- Gateway contexts expire after five minutes.
- Gateway rejects unsigned, expired, non-ServiceNow, non-HTTPS, private-IP, and disallowed-host contexts.
- Use `SERVICENOW_ALLOWED_HOST_SUFFIXES` to restrict allowed ServiceNow domains.
- Keep write/admin ServiceNow tools approval-gated in agent tool bindings.
