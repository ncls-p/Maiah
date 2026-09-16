import { NextRequest, NextResponse } from "next/server";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { verifyWorkspaceApiKey } from "@/modules/api-keys/use-cases";
import { createMaiahMcpServer } from "@/modules/maiah-mcp/server";

import { env } from "@/lib/env";
import { serverErrorResponse } from "@/lib/server-error-response";
import { db } from "@/server/infrastructure/db";
import { users } from "@/server/infrastructure/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  try {
    return await serveMcp(request);
  } catch (error) {
    return NextResponse.json(serverErrorResponse(error, crypto.randomUUID()), {
      status: 500,
    });
  }
}
async function serveMcp(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(env.BETTER_AUTH_URL).origin)
    return NextResponse.json({ error: "Origin not allowed" }, { status: 403 });
  const header = request.headers.get("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7).trim() : null;
  const identity = token ? await verifyWorkspaceApiKey(token) : null;
  const [owner] = identity
    ? await db
        .select({ banned: users.banned })
        .from(users)
        .where(eq(users.id, identity.createdById))
        .limit(1)
    : [];
  if (!identity || !owner || owner.banned)
    return NextResponse.json(
      { error: "A valid workspace API token is required" },
      {
        status: 401,
        headers: { "WWW-Authenticate": 'Bearer realm="Maiah MCP"' },
      },
    );
  if (Number(request.headers.get("content-length") ?? 0) > 300_000)
    return NextResponse.json({ error: "Request too large" }, { status: 413 });
  const text = await request.text();
  if (text.length > 300_000)
    return NextResponse.json({ error: "Request too large" }, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const server = createMaiahMcpServer({
    userId: identity.createdById,
    workspaceId: identity.workspaceId,
    authentication: "apiKey",
    headers: { Authorization: `Bearer ${token}` },
  });
  const transport = new WebStandardStreamableHTTPServerTransport({
    enableJsonResponse: true,
  });
  await server.connect(transport);
  try {
    return await transport.handleRequest(request, { parsedBody: body });
  } finally {
    await server.close();
  }
}
export async function GET() {
  return new Response(null, { status: 405, headers: { Allow: "POST" } });
}
export async function DELETE() {
  return new Response(null, { status: 405, headers: { Allow: "POST" } });
}
