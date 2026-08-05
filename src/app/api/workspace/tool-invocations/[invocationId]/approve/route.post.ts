import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { decryptValue, encryptValue } from "@/lib/crypto";
import { logger, logHandledError } from "@/lib/logger";
import {
  handleRoute,
  requireWorkspacePermissionAsync,
} from "@/lib/route-handler";
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
import { db } from "@/server/infrastructure/db";
import {
  conversations,
  mcpTools,
  toolInvocations,
} from "@/server/infrastructure/db/schema";

import { invocationParamsSchema } from "../../invocation-shared";
import { InvocationExecutionError, alreadyResolvedResponse, executeInvocation } from "./route.invocation-execution-error";


export async function POST(
  req: Request,
  { params }: { params: Promise<{ invocationId: string }> },
) {
  return handleRoute(req as NextRequest, async ({ session, requestId }) => {
    const startedAt = Date.now();
    try {
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
      const forbidden = await requireWorkspacePermissionAsync(
        session.user.id,
        invocation.workspaceId,
        approvalPermission,
      );
      if (forbidden) {
        logger.warn("Tool invocation approval rejected", {
          requestId,
          userId: session.user.id,
          invocationId: invocation.id,
          toolName: invocation.toolName,
          reason: "missing_permission",
          durationMs: Date.now() - startedAt,
        });
        return forbidden;
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
        const result = await executeInvocation(
          claimedInvocation,
          session.user.id,
        );
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
        const errorMessage = safeToolErrorMessage(
          error,
          "Tool execution failed",
        );
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
  });
}
