import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  handleRoute,
  requireWorkspacePermissionAsync,
} from "@/lib/route-handler";
import { createWorkflowSchema } from "@/modules/workflows/contracts";
import { createWorkflow, listWorkflows } from "@/modules/workflows/use-cases";

import { workflowErrorResponse } from "./route-support";

const querySchema = z.object({ workspaceId: z.uuid() });

export async function GET(req: NextRequest) {
  return handleRoute(
    req,
    async ({ session }) => {
      const parsed = querySchema.safeParse({
        workspaceId: req.nextUrl.searchParams.get("workspaceId"),
      });
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Invalid workspaceId" },
          { status: 400 },
        );
      }
      const forbidden = await requireWorkspacePermissionAsync(
        session.user.id,
        parsed.data.workspaceId,
        "workflows.view",
      );
      if (forbidden) return forbidden;
      return NextResponse.json({
        workflows: await listWorkflows(parsed.data.workspaceId),
      });
    },
    {
      logLabel: "Failed to list workflows",
      expectedError: workflowErrorResponse,
    },
  );
}

export async function POST(req: NextRequest) {
  return handleRoute(
    req,
    async ({ session }) => {
      const parsed = createWorkflowSchema.safeParse(await req.json());
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Invalid input", details: parsed.error.issues },
          { status: 400 },
        );
      }
      const forbidden = await requireWorkspacePermissionAsync(
        session.user.id,
        parsed.data.workspaceId,
        "workflows.create",
      );
      if (forbidden) return forbidden;
      const workflow = await createWorkflow({
        ...parsed.data,
        userId: session.user.id,
      });
      return NextResponse.json({ workflow }, { status: 201 });
    },
    {
      logLabel: "Failed to create workflow",
      expectedError: workflowErrorResponse,
    },
  );
}
