import { createServer, type ServerResponse } from "node:http";
import { createHash, randomUUID } from "node:crypto";
export async function startMcpOAuthServer(port = 0) {
  const state = {
    requireAuth: true,
    sse: false,
    refreshes: 0,
    revocations: 0,
    lists: 0,
    registration: 0,
    pkce: true,
    tokenFailure: false,
    failList: false,
    tools: [
      {
        name: "search",
        description: "Find information",
        inputSchema: { type: "object", properties: {} },
      },
    ],
    tokens: new Set<string>(),
    codes: new Map<string, string>(),
    refresh: new Set<string>(),
  };
  let origin = "";
  let events: ServerResponse | undefined;
  const json = (
    res: ServerResponse,
    data: unknown,
    status = 200,
    headers: Record<string, string> = {},
  ) => {
    res.writeHead(status, { "Content-Type": "application/json", ...headers });
    res.end(JSON.stringify(data));
  };
  const server = createServer(async (req, res) => {
    const url = new URL(req.url!, origin);
    const parts: Buffer[] = [];
    for await (const part of req) parts.push(Buffer.from(part));
    const raw = Buffer.concat(parts).toString();
    if (url.pathname.startsWith("/.well-known/oauth-protected-resource"))
      return json(res, {
        resource: `${origin}/mcp`,
        authorization_servers: [origin],
        scopes_supported: ["tools.read"],
      });
    if (url.pathname.startsWith("/.well-known/"))
      return json(res, {
        issuer: origin,
        authorization_endpoint: `${origin}/authorize`,
        token_endpoint: `${origin}/token`,
        registration_endpoint: `${origin}/register`,
        revocation_endpoint: `${origin}/revoke`,
        response_types_supported: ["code"],
        grant_types_supported: ["authorization_code", "refresh_token"],
        token_endpoint_auth_methods_supported: ["none", "client_secret_post"],
        code_challenge_methods_supported: state.pkce ? ["S256"] : [],
      });
    if (url.pathname === "/register") {
      state.registration++;
      return json(
        res,
        {
          client_id: "dynamic-client",
          redirect_uris: JSON.parse(raw).redirect_uris,
          token_endpoint_auth_method: "none",
        },
        201,
      );
    }
    if (url.pathname === "/authorize") {
      const code = randomUUID();
      state.codes.set(code, url.searchParams.get("code_challenge")!);
      const target = new URL(url.searchParams.get("redirect_uri")!);
      target.searchParams.set("code", code);
      target.searchParams.set("state", url.searchParams.get("state")!);
      res.writeHead(302, { Location: target.href });
      res.end();
      return;
    }
    if (url.pathname === "/revoke") {
      state.revocations++;
      const body = new URLSearchParams(raw);
      state.tokens.delete(body.get("token")!);
      state.refresh.delete(body.get("token")!);
      return json(res, {});
    }
    if (url.pathname === "/token") {
      const body = new URLSearchParams(raw);
      if (state.tokenFailure) return json(res, { error: "invalid_grant" }, 400);
      if (body.get("resource") !== `${origin}/mcp`)
        return json(res, { error: "invalid_target" }, 400);
      if (body.get("grant_type") === "refresh_token") {
        state.refreshes++;
        if (!state.refresh.delete(body.get("refresh_token")!))
          return json(res, { error: "invalid_grant" }, 400);
      } else {
        const challenge = state.codes.get(body.get("code")!);
        state.codes.delete(body.get("code")!);
        if (
          !challenge ||
          challenge !==
            createHash("sha256")
              .update(body.get("code_verifier") ?? "")
              .digest("base64url")
        )
          return json(res, { error: "invalid_grant" }, 400);
      }
      const access_token = randomUUID(),
        refresh_token = randomUUID();
      state.tokens.add(access_token);
      state.refresh.add(refresh_token);
      return json(res, {
        access_token,
        refresh_token,
        token_type: "Bearer",
        expires_in: 3600,
        scope: "tools.read",
      });
    }
    if (url.pathname === "/redirect") {
      res.writeHead(302, { Location: "http://127.0.0.1:1/private" });
      res.end();
      return;
    }
    if (url.pathname !== "/mcp") return json(res, {}, 404);
    if (
      state.requireAuth &&
      !state.tokens.has(
        req.headers.authorization?.replace(/^Bearer /, "") ?? "",
      )
    )
      return json(res, { error: "unauthorized" }, 401, {
        "WWW-Authenticate": `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource/mcp", scope="tools.read"`,
      });
    if (state.sse && req.method === "GET") {
      events = res;
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
      });
      res.write(`event: endpoint\ndata: /mcp?session=fixture\n\n`);
      return;
    }
    if (state.sse && !url.searchParams.has("session"))
      return json(res, {}, 405);
    if (req.method !== "POST") return json(res, {}, 405);
    const reply = (response: ServerResponse, data: unknown) => {
      if (!state.sse) return json(response, data);
      events!.write(`event: message\ndata: ${JSON.stringify(data)}\n\n`);
      response.writeHead(202);
      response.end();
    };
    const rpc = JSON.parse(raw);
    if (rpc.id === undefined) {
      res.writeHead(202);
      res.end();
      return;
    }
    if (rpc.method === "initialize")
      return reply(res, {
        jsonrpc: "2.0",
        id: rpc.id,
        result: {
          protocolVersion: "2025-11-25",
          capabilities: { tools: { listChanged: true } },
          serverInfo: { name: "fixture", version: "1" },
        },
      });
    if (rpc.method === "tools/list") {
      state.lists++;
      if (state.failList)
        return reply(res, {
          jsonrpc: "2.0",
          id: rpc.id,
          error: { code: -32603, message: "fixture error" },
        });
      return reply(res, {
        jsonrpc: "2.0",
        id: rpc.id,
        result: { tools: state.tools },
      });
    }
    return reply(res, {
      jsonrpc: "2.0",
      id: rpc.id,
      result: { content: [{ type: "text", text: "Found it" }] },
    });
  });
  await new Promise<void>((resolve) =>
    server.listen(port, "127.0.0.1", resolve),
  );
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  return {
    origin,
    state,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}
