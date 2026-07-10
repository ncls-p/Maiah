import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  handleRoute,
  requireWorkspacePermissionAsync,
} from "@/lib/route-handler";
import { canManageTenantGlobals } from "@/modules/admin/auth";
import { abortActiveAgentRun } from "@/modules/agent/runtime-executor";
import {
  getAgentRun,
  requestAgentRunCancellation,
} from "@/modules/agent/run-use-cases";
import { getVisibleAgentById } from "@/modules/agent/use-cases";

const paramsSchema = z.object({ agentId: z.uuid(), runId: z.uuid() });
const querySchema = z.object({ workspaceId: z.uuid() });

async function resolveVisibleRun(input: {
  agentId: string;
  runId: string;
  workspaceId: string;
  userId: string;
  canAdminCurate: boolean;
}) {
  const agent = await getVisibleAgentById(
    input.agentId,
    input.workspaceId,
    input.userId,
    input.canAdminCurate,
  );
  if (!agent) return null;
  const run = await getAgentRun(input.runId, input.workspaceId);
  if (!run || run.agentId !== agent.id) return null;
  return run;
}

async function parseRequest(
  req: NextRequest,
  params: Promise<{ agentId: string; runId: string }>,
) {
  const parsedParams = paramsSchema.safeParse(await params);
  const parsedQuery = querySchema.safeParse({
    workspaceId: req.nextUrl.searchParams.get("workspaceId"),
  });
  if (!parsedParams.success || !parsedQuery.success) return null;
  return { ...parsedParams.data, ...parsedQuery.data };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string; runId: string }> },
) {
  return handleRoute(
    req,
    async ({ session }) => {
      const request = await parseRequest(req, params);
      if (!request) {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
      }
      const forbidden = await requireWorkspacePermissionAsync(
        session.user.id,
        request.workspaceId,
        "agents.get",
      );
      if (forbidden) return forbidden;
      const run = await resolveVisibleRun({
        ...request,
        userId: session.user.id,
        canAdminCurate: await canManageTenantGlobals(
          session,
          request.workspaceId,
        ),
      });
      if (!run) {
        return NextResponse.json({ error: "Run not found" }, { status: 404 });
      }
      return NextResponse.json(run);
    },
    { logLabel: "Failed to get agent run" },
  );
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string; runId: string }> },
) {
  return handleRoute(
    req,
    async ({ session }) => {
      const request = await parseRequest(req, params);
      if (!request) {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
      }
      const forbidden = await requireWorkspacePermissionAsync(
        session.user.id,
        request.workspaceId,
        "agents.chat",
      );
      if (forbidden) return forbidden;
      const run = await resolveVisibleRun({
        ...request,
        userId: session.user.id,
        canAdminCurate: await canManageTenantGlobals(
          session,
          request.workspaceId,
        ),
      });
      if (!run) {
        return NextResponse.json({ error: "Run not found" }, { status: 404 });
      }
      const cancelled = await requestAgentRunCancellation(run.id);
      if (!cancelled) {
        return NextResponse.json(
          { error: `Run is already ${run.status}`, status: run.status },
          { status: 409 },
        );
      }
      const abortedLocally = abortActiveAgentRun(run.id);
      return NextResponse.json({
        id: cancelled.id,
        status: cancelled.status,
        cancellationRequested: true,
        abortedLocally,
      });
    },
    { logLabel: "Failed to cancel agent run" },
  );
}
