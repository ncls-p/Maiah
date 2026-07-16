import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  handleRoute,
  requireWorkspacePermissionAsync,
} from "@/lib/route-handler";
import { canManageTenantGlobals } from "@/modules/admin/auth";
import {
  AgentExecutionError,
  AgentRunStateError,
  executeAgent,
} from "@/modules/agent/runtime-executor";
import { listAgentRuns } from "@/modules/agent/run-use-cases";
import { getVisibleAgentById } from "@/modules/agent/use-cases";
import { WorkspaceQuotaReservationError } from "@/modules/usage/quota-reservations";

const paramsSchema = z.object({ agentId: z.uuid() });
const listSchema = z.object({
  workspaceId: z.uuid(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
const executeSchema = z.object({
  workspaceId: z.uuid(),
  prompt: z.string().trim().min(1).max(32_000),
  versionId: z.uuid().optional(),
  mode: z.enum(["run", "dry_run"]).default("run"),
  idempotencyKey: z.string().trim().min(1).max(255).optional(),
});

function executionErrorResponse(error: unknown) {
  if (error instanceof WorkspaceQuotaReservationError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: 429 },
    );
  }
  if (error instanceof AgentRunStateError) {
    return NextResponse.json(
      {
        error: error.message,
        code: error.code,
        runId: error.runId,
        runStatus: error.status,
      },
      { status: 409 },
    );
  }
  if (error instanceof AgentExecutionError) {
    const status = error.code.endsWith("FORBIDDEN")
      ? 403
      : error.code.includes("NOT_FOUND")
        ? 404
        : error.code.includes("MODEL_NOT_CONFIGURED")
          ? 400
          : error.code.includes("LIMIT") || error.code.includes("BUDGET")
            ? 422
            : 500;
    return NextResponse.json(
      { error: error.message, code: error.code, runId: error.runId },
      { status },
    );
  }
  return null;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  return handleRoute(
    req,
    async ({ session }) => {
      const parsedParams = paramsSchema.safeParse(await params);
      const parsedQuery = listSchema.safeParse({
        workspaceId: req.nextUrl.searchParams.get("workspaceId"),
        limit: req.nextUrl.searchParams.get("limit") ?? undefined,
      });
      if (!parsedParams.success || !parsedQuery.success) {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
      }
      const forbidden = await requireWorkspacePermissionAsync(
        session.user.id,
        parsedQuery.data.workspaceId,
        "agents.get",
      );
      if (forbidden) return forbidden;
      const agent = await getVisibleAgentById(
        parsedParams.data.agentId,
        parsedQuery.data.workspaceId,
        session.user.id,
        await canManageTenantGlobals(session, parsedQuery.data.workspaceId),
      );
      if (!agent) {
        return NextResponse.json({ error: "Agent not found" }, { status: 404 });
      }
      return NextResponse.json(
        await listAgentRuns({
          workspaceId: parsedQuery.data.workspaceId,
          agentId: agent.id,
          limit: parsedQuery.data.limit,
        }),
      );
    },
    { logLabel: "Failed to list agent runs" },
  );
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  return handleRoute(
    req,
    async ({ session }) => {
      const parsedParams = paramsSchema.safeParse(await params);
      const parsedBody = executeSchema.safeParse(await req.json());
      if (!parsedParams.success || !parsedBody.success) {
        return NextResponse.json(
          {
            error: "Invalid request",
            details: parsedBody.success ? undefined : parsedBody.error.issues,
          },
          { status: 400 },
        );
      }
      const forbidden = await requireWorkspacePermissionAsync(
        session.user.id,
        parsedBody.data.workspaceId,
        "agents.chat",
      );
      if (forbidden) return forbidden;
      const result = await executeAgent({
        workspaceId: parsedBody.data.workspaceId,
        userId: session.user.id,
        agentId: parsedParams.data.agentId,
        agentVersionId: parsedBody.data.versionId,
        prompt: parsedBody.data.prompt,
        trigger: parsedBody.data.mode === "dry_run" ? "dry_run" : "api",
        idempotencyKey: parsedBody.data.idempotencyKey,
      });
      return NextResponse.json(result, { status: result.reused ? 200 : 201 });
    },
    {
      logLabel: "Failed to execute agent run",
      expectedError: executionErrorResponse,
    },
  );
}
