import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  handleRoute,
  requireWorkspacePermissionAsync,
} from "@/lib/route-handler";
import {
  approveWorkflowAgentRunRequest,
  rejectWorkflowAgentRunRequest,
  WorkflowAgentRunDecisionError,
} from "@/modules/workflows/agentic-run-approvals";

const paramsSchema = z.object({
  workflowId: z.uuid(),
  requestId: z.uuid(),
});
const bodySchema = z.object({
  workspaceId: z.uuid(),
  decision: z.enum(["approve", "reject"]),
});

export async function POST(
  req: NextRequest,
  {
    params,
  }: {
    params: Promise<{ workflowId: string; requestId: string }>;
  },
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
        "workflows.execute",
      );
      if (forbidden) return forbidden;
      const command = {
        ...parsedParams.data,
        workspaceId: parsedBody.data.workspaceId,
        userId: session.user.id,
      };
      const result =
        parsedBody.data.decision === "approve"
          ? await approveWorkflowAgentRunRequest(command)
          : await rejectWorkflowAgentRunRequest(command);
      return NextResponse.json(result);
    },
    {
      logLabel: "Failed to decide workflow assistant run request",
      expectedError: (error) =>
        error instanceof WorkflowAgentRunDecisionError
          ? NextResponse.json(
              { error: error.message },
              { status: error.status },
            )
          : null,
    },
  );
}
