import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  handleRoute,
  requireWorkspacePermissionAsync,
} from "@/lib/route-handler";
import { executeWorkflowSchema } from "@/modules/workflows/contracts";
import {
  createWorkflowRun,
  listWorkflowRuns,
} from "@/modules/workflows/use-cases";

import { workflowErrorResponse } from "../../route-support";

const paramsSchema = z.object({ workflowId: z.uuid() });
const querySchema = z.object({ workspaceId: z.uuid() });

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ workflowId: string }> },
) {
  return handleRoute(
    req,
    async ({ session }) => {
      const parsedParams = paramsSchema.safeParse(await params);
      const parsedQuery = querySchema.safeParse({
        workspaceId: req.nextUrl.searchParams.get("workspaceId"),
      });
      if (!parsedParams.success || !parsedQuery.success) {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
      }
      const forbidden = await requireWorkspacePermissionAsync(
        session.user.id,
        parsedQuery.data.workspaceId,
        "workflows.view",
      );
      if (forbidden) return forbidden;
      return NextResponse.json({
        runs: await listWorkflowRuns(
          parsedParams.data.workflowId,
          parsedQuery.data.workspaceId,
        ),
      });
    },
    {
      logLabel: "Failed to list workflow runs",
      expectedError: workflowErrorResponse,
    },
  );
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ workflowId: string }> },
) {
  return handleRoute(
    req,
    async ({ session }) => {
      const parsedParams = paramsSchema.safeParse(await params);
      const parsedBody = executeWorkflowSchema.safeParse(await req.json());
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
        "workflows.execute",
      );
      if (forbidden) return forbidden;
      const run = await createWorkflowRun({
        workflowId: parsedParams.data.workflowId,
        workspaceId: parsedBody.data.workspaceId,
        userId: session.user.id,
        payload: parsedBody.data.input,
        useLatestDraft: parsedBody.data.useLatestDraft,
        idempotencyKey: parsedBody.data.idempotencyKey,
      });
      return NextResponse.json({ run }, { status: 202 });
    },
    {
      logLabel: "Failed to execute workflow",
      expectedError: workflowErrorResponse,
    },
  );
}
