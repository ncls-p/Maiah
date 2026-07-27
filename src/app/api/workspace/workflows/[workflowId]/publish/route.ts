import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  handleRoute,
  requireWorkspacePermissionAsync,
} from "@/lib/route-handler";
import { publishWorkflow } from "@/modules/workflows/use-cases";

import { workflowErrorResponse } from "../../route-support";

const paramsSchema = z.object({ workflowId: z.uuid() });
const bodySchema = z.object({ workspaceId: z.uuid() });

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ workflowId: string }> },
) {
  return handleRoute(
    req,
    async ({ session }) => {
      const parsedParams = paramsSchema.safeParse(await params);
      const parsedBody = bodySchema.safeParse(await req.json());
      if (!parsedParams.success || !parsedBody.success) {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
      }
      const forbidden = await requireWorkspacePermissionAsync(
        session.user.id,
        parsedBody.data.workspaceId,
        "workflows.update",
      );
      if (forbidden) return forbidden;
      return NextResponse.json({
        workflow: await publishWorkflow(
          parsedParams.data.workflowId,
          parsedBody.data.workspaceId,
        ),
      });
    },
    {
      logLabel: "Failed to publish workflow",
      expectedError: workflowErrorResponse,
    },
  );
}
