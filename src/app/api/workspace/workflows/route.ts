import { NextRequest,NextResponse } from "next/server";
import { z } from "zod";

import { handleRoute,requireRequestPermissionScopeAsync,requireWorkspaceMemberAsync,requireWorkspacePermissionAsync } from "@/lib/route-handler";
import { hasResourcePermissionForRequest } from "@/modules/auth/workspace-access";
import { createWorkflowSchema } from "@/modules/workflows/contracts";
import { createWorkflow,listWorkflows } from "@/modules/workflows/use-cases";

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
        return NextResponse.json({ error: "Invalid workspaceId" }, { status: 400 });
      }
      const scopeForbidden = await requireRequestPermissionScopeAsync(session.user.id, parsed.data.workspaceId, "workflows.view");
      if (scopeForbidden) return scopeForbidden;
      const forbidden = await requireWorkspaceMemberAsync(session.user.id, parsed.data.workspaceId);
      if (forbidden) return forbidden;
      const workflows = await listWorkflows(parsed.data.workspaceId);
      const visibleWorkflows = await Promise.all(workflows.map(async (workflow) => ((await hasResourcePermissionForRequest(session.user.id, parsed.data.workspaceId, "workflows.view", "workflow", workflow.id)) ? workflow : null)));
      return NextResponse.json({
        workflows: visibleWorkflows.filter((workflow) => workflow !== null),
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
        return NextResponse.json({ error: "Invalid input", details: parsed.error.issues }, { status: 400 });
      }
      const forbidden = await requireWorkspacePermissionAsync(session.user.id, parsed.data.workspaceId, "workflows.create");
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
