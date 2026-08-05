import { decryptValue } from "@/lib/crypto";
import { executeCustomToolWorkflow } from "@/modules/custom-tools/use-cases";
import { executeMcpTool } from "@/modules/mcp/executor";
import { getBuiltInTool } from "@/modules/tool/builtin-tools";
import { db } from "@/server/infrastructure/db";
import { mcpTools,toolInvocations } from "@/server/infrastructure/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export class InvocationExecutionError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "InvocationExecutionError";
  }
}

export async function executeInvocation(invocation: typeof toolInvocations.$inferSelect, userId: string) {
  const input = invocation.inputJsonEncrypted ? JSON.parse(await decryptValue(invocation.inputJsonEncrypted)) : undefined;

  let output: unknown;
  if (invocation.toolSource === "builtin") {
    const tool = getBuiltInTool(invocation.toolId);
    if (!tool) {
      throw new InvocationExecutionError("Tool not found", 404);
    }
    output = await tool.execute(input as never, {
      workspaceId: invocation.workspaceId,
      userId,
    });
  } else if (invocation.toolSource === "custom") {
    output = await executeCustomToolWorkflow({
      workspaceId: invocation.workspaceId,
      userId,
      customToolId: invocation.toolId,
      toolInput: input,
    });
  } else if (invocation.toolSource === "mcp") {
    const [tool] = await db.select({ mcpServerId: mcpTools.mcpServerId }).from(mcpTools).where(eq(mcpTools.id, invocation.toolId)).limit(1);
    if (!tool) {
      throw new InvocationExecutionError("MCP tool not found", 404);
    }
    output = await executeMcpTool({
      serverId: tool.mcpServerId,
      toolId: invocation.toolId,
      workspaceId: invocation.workspaceId,
      userId,
      toolInput: input,
    });
  } else {
    throw new InvocationExecutionError("Unsupported tool source", 400);
  }
  return output;
}

export function alreadyResolvedResponse(status: string) {
  if (status === "success") {
    return NextResponse.json({ ok: true, status, alreadyResolved: true });
  }
  if (status === "running") {
    return NextResponse.json({ ok: true, status, alreadyResolved: true }, { status: 202 });
  }
  return NextResponse.json({ error: `Invocation can no longer be approved (status: ${status})` }, { status: 409 });
}
