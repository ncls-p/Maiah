import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  handleRoute,
  requireWorkspacePermissionAsync,
} from "@/lib/route-handler";
import { submitWorkflowAgentInputRequest } from "@/modules/workflows/agentic-history";

const paramsSchema = z.object({
  workflowId: z.uuid(),
  requestId: z.uuid(),
});

const bodySchema = z.object({
  workspaceId: z.uuid(),
  values: z.record(z.string(), z.string().max(20_000)),
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
        "workflows.update",
      );
      if (forbidden) return forbidden;

      return NextResponse.json(
        await submitWorkflowAgentInputRequest({
          ...parsedParams.data,
          workspaceId: parsedBody.data.workspaceId,
          userId: session.user.id,
          values: parsedBody.data.values,
        }),
      );
    },
    {
      logLabel: "Failed to submit workflow assistant information",
      expectedError: (error) =>
        NextResponse.json(
          {
            error:
              error instanceof Error
                ? error.message
                : "Unable to submit information",
          },
          { status: 400 },
        ),
    },
  );
}
