import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import {
  CallToolResultSchema,
  ListToolsResultSchema,
  type CallToolResult,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";

import { mcpFetch } from "./network";
import { oauthHeaders } from "./oauth/tokens";
import { decryptValue } from "@/lib/crypto";
import type { mcpServers } from "@/server/infrastructure/db/schema";

type McpServerRow = typeof mcpServers.$inferSelect;
type McpTransport = McpServerRow["transport"];
type McpClientOptions = {
  headers?: Record<string, string>;
  userId?: string;
  workspaceId?: string;
};

const CONNECT_TIMEOUT_MS = 15_000;

async function buildAuthHeaders(
  server: McpServerRow,
  extraHeaders: Record<string, string> = {},
): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};
  if (server.encryptedHeadersJson) {
    const encrypted = server.encryptedHeadersJson as Record<string, string>;
    for (const [key, value] of Object.entries(encrypted)) {
      headers[key] = await decryptValue(value);
    }
  }
  return { ...headers, ...extraHeaders };
}

function createTransport(
  url: URL,
  transport: McpTransport,
  headers: Record<string, string>,
): Transport {
  const requestInit: RequestInit = { headers };

  if (transport === "sse") {
    return new SSEClientTransport(url, {
      requestInit,
      fetch: mcpFetch,
      eventSourceInit: {
        fetch: (input, init) => {
          const merged = new Headers(init?.headers);
          for (const [name, value] of Object.entries(headers))
            merged.set(name, value);
          return mcpFetch(input, { ...init, headers: merged });
        },
      },
    });
  }

  return new StreamableHTTPClientTransport(url, {
    requestInit,
    fetch: mcpFetch,
  });
}

async function connectTransport(client: Client, transport: Transport) {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      client.connect(transport),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error("MCP connection timed out")),
          CONNECT_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

async function connectClient(
  server: McpServerRow,
  options: McpClientOptions = {},
): Promise<{ client: Client; transport: Transport }> {
  if (server.transport === "stdio") throw new Error("MCP_STDIO_UNSUPPORTED");
  if (!server.url) throw new Error("MCP server URL is not configured");

  let url: URL;
  try {
    url = new URL(server.url);
  } catch {
    throw new Error(`Invalid MCP server URL: ${server.url}`);
  }
  const headers = await buildAuthHeaders(server, options.headers);
  const oauth = await oauthHeaders(server, options.userId, options.workspaceId);
  if (oauth) {
    for (const key of Object.keys(headers))
      if (key.toLowerCase() === "authorization") delete headers[key];
    Object.assign(headers, oauth);
  }

  const primaryTransport = createTransport(url, server.transport, headers);
  const fallbackTransport =
    server.transport === "streamable-http"
      ? createTransport(url, "sse", headers)
      : null;

  let lastError: unknown;
  for (const transport of [primaryTransport, fallbackTransport].filter(
    Boolean,
  ) as Transport[]) {
    const client = new Client({ name: "ai-hub", version: "0.1.0" });
    try {
      await connectTransport(client, transport);
      return { client, transport };
    } catch (error) {
      lastError = error;
      try {
        await transport.close();
      } catch {
        /* best-effort cleanup */
      }
      const code =
        typeof error === "object" && error !== null && "code" in error
          ? error.code
          : undefined;
      // Only probe legacy SSE for an unsupported HTTP endpoint, never auth/network failures.
      if (code !== 404 && code !== 405) break;
    }
  }
  const code =
    typeof lastError === "object" && lastError !== null && "code" in lastError
      ? lastError.code
      : undefined;
  throw new Error(
    code === 401 || code === 403
      ? "MCP_OAUTH_CONNECT_REQUIRED"
      : "MCP_CONNECTION_FAILED",
  );
}

async function withMcpClient<T>(
  server: McpServerRow,
  fn: (client: Client) => Promise<T>,
  options: McpClientOptions = {},
): Promise<T> {
  const { client, transport } = await connectClient(server, options);
  let deadline: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      fn(client),
      new Promise<never>((_, reject) => {
        deadline = setTimeout(
          () => reject(new Error("MCP_REQUEST_TIMEOUT")),
          30_000,
        );
      }),
    ]);
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? error.code
        : undefined;
    if (code === 401 || code === 403)
      throw new Error("MCP_OAUTH_CONNECT_REQUIRED");
    throw new Error(
      error instanceof Error && /^MCP_[A-Z_]+$/.test(error.message)
        ? error.message
        : "MCP_REQUEST_FAILED",
    );
  } finally {
    if (deadline) clearTimeout(deadline);
    await transport.close().catch(() => undefined);
  }
}

export async function listRemoteMcpTools(
  server: McpServerRow,
  options: McpClientOptions = {},
): Promise<Tool[]> {
  return withMcpClient(
    server,
    async (client) => {
      const tools: Tool[] = [];
      const seen = new Set<string>();
      let cursor: string | undefined;
      do {
        const result = await client.request(
          { method: "tools/list", params: cursor ? { cursor } : {} },
          ListToolsResultSchema,
        );
        tools.push(...result.tools);
        cursor = result.nextCursor;
        if (cursor && (seen.has(cursor) || seen.size >= 100))
          throw new Error("MCP_PAGINATION_INVALID");
        if (cursor) seen.add(cursor);
      } while (cursor);
      return tools;
    },
    options,
  );
}

export async function callRemoteMcpTool(
  server: McpServerRow,
  toolName: string,
  toolInput: unknown,
  options: McpClientOptions = {},
): Promise<CallToolResult> {
  return withMcpClient(
    server,
    async (client) =>
      client.request(
        {
          method: "tools/call",
          params: {
            name: toolName,
            arguments:
              toolInput && typeof toolInput === "object"
                ? (toolInput as Record<string, unknown>)
                : {},
          },
        },
        CallToolResultSchema,
      ),
    options,
  );
}
