import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { decryptValue, encryptValue } from "@/lib/crypto";
import { logger, logHandledError } from "@/lib/logger";
import { getSession } from "@/modules/auth/session";
import { executeCustomToolWorkflow } from "@/modules/custom-tools/use-cases";
import { executeMcpTool } from "@/modules/mcp/executor";
import { getBuiltInTool } from "@/modules/tool/builtin-tools";
import {
  claimToolInvocationForExecution,
  completeToolInvocationFailure,
  completeToolInvocationSuccess,
} from "@/modules/tool/invocation-approval";
import { safeToolErrorMessage } from "@/modules/tool/safe-payload";
import { audit } from "@/server/domain/services/audit";
import { authorization } from "@/server/domain/services/authorization";
import { db } from "@/server/infrastructure/db";
import {
  conversations,
  mcpTools,
  toolInvocations,
} from "@/server/infrastructure/db/schema";

import { invocationParamsSchema } from "../../invocation-shared";

class InvocationExecutionError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "InvocationExecutionError";
  }
}

async function executeInvocation(
  invocation: typeof toolInvocations.$inferSelect,
  userId: string,
) {
  const input = invocation.inputJsonEncrypted
    ? JSON.parse(await decryptValue(invocation.inputJsonEncrypted))
    : undefined;

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
    const [tool] = await db
      .select({ mcpServerId: mcpTools.mcpServerId })
      .from(mcpTools)
      .where(eq(mcpTools.id, invocation.toolId))
      .limit(1);
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

function alreadyResolvedResponse(status: string) {
  if (status === "success") {
    return NextResponse.json({ ok: true, status, alreadyResolved: true });
  }
  if (status === "running") {
    return NextResponse.json(
      { ok: true, status, alreadyResolved: true },
      { status: 202 },
    );
  }
  return NextResponse.json(
    { error: `Invocation can no longer be approved (status: ${status})` },
    { status: 409 },
  );
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ invocationId: string }> },
) {
  const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();
  const startedAt = Date.now();
  try {
    const session = await getSession();
    if (!session) {
      logger.warn("Tool invocation approval rejected", {
        requestId,
        reason: "no_session",
        durationMs: Date.now() - startedAt,
      });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = invocationParamsSchema.safeParse(await params);
    if (!parsed.success) {
      logger.warn("Tool invocation approval rejected", {
        requestId,
        userId: session.user.id,
        reason: "invalid_request",
        durationMs: Date.now() - startedAt,
      });
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const [row] = await db
      .select({ invocation: toolInvocations, conversation: conversations })
      .from(toolInvocations)
      .innerJoin(
        conversations,
        eq(toolInvocations.conversationId, conversations.id),
      )
      .where(
        and(
          eq(toolInvocations.id, parsed.data.invocationId),
          eq(conversations.userId, session.user.id),
        ),
      )
      .limit(1);
    const invocation = row?.invocation;

    if (!invocation) {
      logger.warn("Tool invocation approval rejected", {
        requestId,
        userId: session.user.id,
        invocationId: parsed.data.invocationId,
        reason: "not_found",
        durationMs: Date.now() - startedAt,
      });
      return NextResponse.json(
        { error: "Invocation not found" },
        { status: 404 },
      );
    }

    const approvalPermission =
      invocation.toolSource === "builtin" &&
      getBuiltInTool(invocation.toolId)?.name ===
        "github_publish_code_workspace"
        ? "agents.chat"
        : "tools.executeRestricted";
    const permissionGranted = await authorization.hasPermission(
      { principalType: "user", principalId: session.user.id },
      approvalPermission,
      "workspace",
      invocation.workspaceId,
    );
    if (!permissionGranted) {
      logger.warn("Tool invocation approval rejected", {
        requestId,
        userId: session.user.id,
        invocationId: invocation.id,
        toolName: invocation.toolName,
        reason: "missing_permission",
        durationMs: Date.now() - startedAt,
      });
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const claim = await claimToolInvocationForExecution(
      invocation.id,
      session.user.id,
    );
    if (claim.kind === "missing") {
      return NextResponse.json(
        { error: "Invocation not found" },
        { status: 404 },
      );
    }
    if (claim.kind === "unchanged") {
      logger.info("Tool invocation approval already resolved", {
        requestId,
        userId: session.user.id,
        invocationId: invocation.id,
        currentStatus: claim.invocation.status,
        durationMs: Date.now() - startedAt,
      });
      return alreadyResolvedResponse(claim.invocation.status);
    }

    const claimedInvocation = claim.invocation;

    logger.info("Tool invocation approval started", {
      requestId,
      userId: session.user.id,
      invocationId: claimedInvocation.id,
      toolName: claimedInvocation.toolName,
      toolSource: claimedInvocation.toolSource,
      workspaceId: claimedInvocation.workspaceId,
    });

    const execStartedAt = Date.now();
    try {
      const result = await executeInvocation(claimedInvocation, session.user.id);
      const latencyMs = Date.now() - execStartedAt;
      const completed = await completeToolInvocationSuccess(
        claimedInvocation.id,
        {
          encryptedOutput: await encryptValue(JSON.stringify(result ?? null)),
          latencyMs,
        },
      );
      if (!completed) {
        return NextResponse.json(
          { error: "Invocation state changed during execution" },
          { status: 409 },
        );
      }

      try {
        await audit.emit({
          workspaceId: claimedInvocation.workspaceId,
          actorPrincipalType: "user",
          actorPrincipalId: session.user.id,
          action: "toolInvocation.approved",
          resourceType: "tool_invocation",
          resourceId: claimedInvocation.id,
          outcome: "success",
          metadata: {
            toolName: claimedInvocation.toolName,
            toolSource: claimedInvocation.toolSource,
            riskLevel: claimedInvocation.riskLevel,
          },
        });
      } catch (auditError) {
        logHandledError(
          "Tool invocation approval audit failed",
          { requestId, invocationId: claimedInvocation.id },
          auditError as Error,
        );
      }

      logger.info("Tool invocation approval completed", {
        requestId,
        userId: session.user.id,
        invocationId: claimedInvocation.id,
        toolName: claimedInvocation.toolName,
        toolSource: claimedInvocation.toolSource,
        workspaceId: claimedInvocation.workspaceId,
        latencyMs,
        durationMs: Date.now() - startedAt,
      });

      return NextResponse.json({ ok: true, status: "success" });
    } catch (error) {
      const latencyMs = Date.now() - execStartedAt;
      const errorMessage = safeToolErrorMessage(error, "Tool execution failed");
      await completeToolInvocationFailure(claimedInvocation.id, {
        errorMessage,
        latencyMs,
      });
      try {
        await audit.emit({
          workspaceId: claimedInvocation.workspaceId,
          actorPrincipalType: "user",
          actorPrincipalId: session.user.id,
          action: "toolInvocation.approved",
          resourceType: "tool_invocation",
          resourceId: claimedInvocation.id,
          outcome: "failed",
          metadata: {
            toolName: claimedInvocation.toolName,
            toolSource: claimedInvocation.toolSource,
            riskLevel: claimedInvocation.riskLevel,
          },
        });
      } catch (auditError) {
        logHandledError(
          "Tool invocation approval failure audit failed",
          { requestId, invocationId: claimedInvocation.id },
          auditError as Error,
        );
      }
      logHandledError(
        "Approved tool execution failed",
        {
          requestId,
          invocationId: claimedInvocation.id,
          durationMs: Date.now() - startedAt,
        },
        new Error(errorMessage),
      );
      return NextResponse.json(
        { error: errorMessage },
        {
          status:
            error instanceof InvocationExecutionError ? error.status : 500,
        },
      );
    }
  } catch (error) {
    logHandledError(
      "Tool invocation approval failed",
      { requestId, durationMs: Date.now() - startedAt },
      error as Error,
    );
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
