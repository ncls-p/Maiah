# Maiah ServiceNow MCP Gateway

Multi-tenant gateway around [`echelon-ai-labs/servicenow-mcp`](https://github.com/echelon-ai-labs/servicenow-mcp).

Maiah keeps one fixed MCP server URL, while each user stores their own ServiceNow connection in Maiah (`tool_connections`). For each tool call, Maiah sends a short-lived AES-GCM encrypted and HMAC-signed context header to this gateway. The gateway creates the upstream ServiceNow MCP server configuration for that SSE session only.

## Runtime contract

Maiah sends these headers to `/sse`:

- `x-maiah-tool-context`: base64url JSON envelope containing AES-GCM ciphertext
- `x-maiah-tool-context-signature`: HMAC-SHA256 hex signature over the encoded envelope

After decryption, the payload contains:

```json
{
  "version": 1,
  "workspaceId": "...",
  "userId": "...",
  "connectorKey": "servicenow",
  "connectionId": "...",
  "issuedAt": 1780000000000,
  "expiresAt": 1780000300000,
  "config": {
    "instanceUrl": "https://your-instance.service-now.com",
    "authType": "basic"
  },
  "secrets": {
    "username": "...",
    "password": "..."
  },
  "settings": {}
}
```

No user secrets are sent as plaintext headers or persisted by the gateway.

## Environment

| Variable | Required | Description |
| --- | --- | --- |
| `MAIAH_MCP_GATEWAY_SHARED_SECRET` or `MCP_GATEWAY_SHARED_SECRET` | yes | Shared HMAC secret. Must match Maiah `MCP_GATEWAY_SHARED_SECRET`. |
| `SERVICENOW_ALLOWED_HOST_SUFFIXES` | no | Comma-separated allowed host suffixes. Default: `service-now.com`. Use `*` only in trusted dev. |
| `SERVICENOW_GATEWAY_RESOLVE_HOSTS` | no | Resolve hostnames and block private IPs. Default: `true`. |
| `SERVICENOW_MCP_TOOL_PACKAGE` | no | Default upstream tool package. Default: `full`. |
| `HOST` / `PORT` | no | Bind address. Defaults `0.0.0.0:8080`. |

## Local run

```bash
cd services/servicenow-mcp-gateway
export MAIAH_MCP_GATEWAY_SHARED_SECRET="$(openssl rand -base64 32)"
pip install -e .
maiah-servicenow-mcp-gateway
```

## Docker

```bash
docker build -t maiah-servicenow-mcp-gateway services/servicenow-mcp-gateway
docker run --rm -p 8080:8080 \
  -e MAIAH_MCP_GATEWAY_SHARED_SECRET="$MCP_GATEWAY_SHARED_SECRET" \
  maiah-servicenow-mcp-gateway
```

## Docker Compose

Local dev:

```bash
docker compose -f docker-compose.dev.yml up -d servicenow-mcp-gateway
```

Production compose:

```bash
MCP_GATEWAY_SHARED_SECRET="$(openssl rand -base64 32)" \
  docker compose -f docker-compose.prod.yml up -d --build servicenow-mcp-gateway
```

Then register this MCP server in Maiah:

```txt
name: ServiceNow Gateway
transport: sse
url: http://servicenow-mcp-gateway:8080/sse
```

For host-based local testing, use `http://127.0.0.1:18080/sse`.

In Maiah, open **Tools → MCP → Tool connections**, provision the ServiceNow connector if needed, then let users create their own encrypted connections with `config.instanceUrl` and `secrets.username/password`.
