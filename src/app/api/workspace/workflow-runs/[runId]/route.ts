import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  handleRoute,
  requireWorkspacePermissionAsync,
} from "@/lib/route-handler";
import { getWorkflowRun } from "@/modules/workflows/use-cases";

import { workflowErrorResponse } from "../../workflows/route-support";

const paramsSchema = z.object({ runId: z.uuid() });
const querySchema = z.object({ workspaceId: z.uuid() });

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
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
        run: await getWorkflowRun(
          parsedParams.data.runId,
          parsedQuery.data.workspaceId,
        ),
      });
    },
    {
      logLabel: "Failed to read workflow run",
      expectedError: workflowErrorResponse,
    },
  );
}
