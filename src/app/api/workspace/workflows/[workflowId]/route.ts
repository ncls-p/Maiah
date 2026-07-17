import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  handleRoute,
  requireWorkspacePermissionAsync,
} from "@/lib/route-handler";
import { updateWorkflowSchema } from "@/modules/workflows/contracts";
import {
  archiveWorkflow,
  getWorkflowDetail,
  updateWorkflow,
} from "@/modules/workflows/use-cases";

import { workflowErrorResponse } from "../route-support";

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
        workflow: await getWorkflowDetail(
          parsedParams.data.workflowId,
          parsedQuery.data.workspaceId,
        ),
      });
    },
    {
      logLabel: "Failed to read workflow",
      expectedError: workflowErrorResponse,
    },
  );
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ workflowId: string }> },
) {
  return handleRoute(
    req,
    async ({ session }) => {
      const parsedParams = paramsSchema.safeParse(await params);
      const parsedBody = updateWorkflowSchema.safeParse(await req.json());
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
        "workflows.update",
      );
      if (forbidden) return forbidden;
      return NextResponse.json({
        workflow: await updateWorkflow({
          ...parsedBody.data,
          workflowId: parsedParams.data.workflowId,
          userId: session.user.id,
        }),
      });
    },
    {
      logLabel: "Failed to update workflow",
      expectedError: workflowErrorResponse,
    },
  );
}

export async function DELETE(
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
        "workflows.delete",
      );
      if (forbidden) return forbidden;
      return NextResponse.json({
        workflow: await archiveWorkflow(
          parsedParams.data.workflowId,
          parsedQuery.data.workspaceId,
        ),
      });
    },
    {
      logLabel: "Failed to archive workflow",
      expectedError: workflowErrorResponse,
    },
  );
}
