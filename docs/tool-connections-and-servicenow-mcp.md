# Tool connections and ServiceNow MCP gateway

Maiah separates **tool definitions** from **per-user connection data**.

## Data model

- `tool_connectors`: integration templates such as `servicenow`, `jira`, or
  `github`.
- `tool_connections`: user-owned or workspace-owned connection instances with
  non-secret `config_json` and encrypted `encrypted_secrets_json`.
- `tool_connection_requirements`: optional mapping from one tool to the connector
  it requires.
- `user_tool_settings`: user-specific per-tool overrides, selected connection,
  and optional per-tool secrets.

This allows the same MCP server and tool catalogue to be shared while each user
keeps their own endpoint, credentials, and tool preferences.

## ServiceNow deployment pattern

1. Deploy `services/servicenow-mcp-gateway` next to Maiah.
2. Set the same secret in Maiah and the gateway:
   - Maiah: `MCP_GATEWAY_SHARED_SECRET`
   - Gateway: `MAIAH_MCP_GATEWAY_SHARED_SECRET` or `MCP_GATEWAY_SHARED_SECRET`
3. Register the gateway once in Maiah as an MCP server:

```txt
name: ServiceNow Gateway
transport: sse
url: http://servicenow-mcp-gateway:8080/sse
```

For local host-based testing, use `http://127.0.0.1:18080/sse` instead.

1. Create a `servicenow` connector linked to that MCP server. The UI can then let
   every user create their own encrypted ServiceNow connection.
2. Users create personal connections from **Tools → MCP → Tool connections** with:
   - ServiceNow instance URL
   - auth type
   - tool package
   - username/password or another supported secret type

At tool execution time, Maiah resolves the current user's connection, decrypts
the secrets, creates a short-lived AES-GCM encrypted + HMAC-signed context, and
sends it as MCP request headers to the gateway. The gateway validates the
signature, decrypts the context in memory, and enforces URL policy before
constructing the ServiceNow MCP session.

## Local setup

1. Generate a gateway secret and put it in `.env`:

```bash
printf 'MCP_GATEWAY_SHARED_SECRET=%s\n' "$(openssl rand -base64 32)" >> .env
```

1. Start local infrastructure and the gateway:

```bash
docker compose -f docker-compose.dev.yml up -d \
  postgres dragonflydb rustfs rustfs-init sandbox-runner servicenow-mcp-gateway
```

1. Start Maiah:

```bash
npm run db:migrate
npm run dev
```

1. In Maiah, go to **Tools → MCP**, add/sync this MCP server:

```txt
name: ServiceNow Gateway (local)
transport: sse
url: http://127.0.0.1:18080/sse
```

1. Create or provision the `servicenow` connector for that MCP server, then use
   **Tool connections → ServiceNow → Add** to store your personal credentials.

2. Open an agent, enable ServiceNow MCP tools in **Capabilities**, save, then
   test from chat.

## Docker Compose production

`docker-compose.prod.yml` now includes `servicenow-mcp-gateway`. Required env:

```bash
MCP_GATEWAY_SHARED_SECRET="$(openssl rand -base64 32)"
SERVICENOW_ALLOWED_HOST_SUFFIXES=service-now.com
SERVICENOW_GATEWAY_RESOLVE_HOSTS=true
```

Bring the stack up:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Use the internal URL in the MCP server record:

```txt
http://servicenow-mcp-gateway:8080/sse
```

## Coolify / GitHub Actions deployment

The Coolify workflow builds and publishes this additional image:

```txt
ghcr.io/<owner>/ai-hub-servicenow-mcp-gateway:<tag>
```

Required GitHub secret for production and previews:

```txt
MCP_GATEWAY_SHARED_SECRET
```

Recommended GitHub variables:

```txt
SERVICENOW_ALLOWED_HOST_SUFFIXES=service-now.com
SERVICENOW_GATEWAY_RESOLVE_HOSTS=true
```

The workflow injects these into Coolify:

- `AI_HUB_SERVICENOW_MCP_GATEWAY_IMAGE`
- `MCP_GATEWAY_SHARED_SECRET`
- `SERVICENOW_ALLOWED_HOST_SUFFIXES`
- `SERVICENOW_GATEWAY_RESOLVE_HOSTS`

After deployment, configure the MCP server in Maiah with:

```txt
transport: sse
url: http://servicenow-mcp-gateway:8080/sse
```

## ServiceNow connector schema

The connector should use a config schema like:

```json
{
  "type": "object",
  "required": ["instanceUrl", "authType"],
  "properties": {
    "instanceUrl": {
      "type": "string",
      "format": "uri",
      "title": "ServiceNow instance URL"
    },
    "authType": {
      "type": "string",
      "enum": ["basic", "oauth", "api_key"],
      "default": "basic"
    },
    "toolPackage": {
      "type": "string",
      "enum": [
        "full",
        "service_desk",
        "catalog_builder",
        "change_coordinator",
        "knowledge_author",
        "platform_developer",
        "agile_management",
        "system_administrator",
        "none"
      ],
      "default": "full"
    }
  }
}
```

Secrets schema:

```json
{
  "type": "object",
  "required": ["username", "password"],
  "properties": {
    "username": { "type": "string", "title": "ServiceNow username" },
    "password": { "type": "password", "title": "ServiceNow password" },
    "apiKey": { "type": "password", "title": "ServiceNow API key" },
    "clientId": { "type": "string", "title": "OAuth client ID" },
    "clientSecret": { "type": "password", "title": "OAuth client secret" }
  }
}
```

## Security notes

- User secrets stay encrypted at rest in Maiah and are never sent as plaintext
  headers or stored by the gateway.
- Gateway contexts expire after five minutes.
- Gateway rejects unsigned, expired, non-ServiceNow, non-HTTPS, private-IP, and
  disallowed-host contexts.
- Use `SERVICENOW_ALLOWED_HOST_SUFFIXES` to restrict allowed ServiceNow domains.
- Keep write/admin ServiceNow tools approval-gated in agent tool bindings.
