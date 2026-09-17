import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  handleRoute,
  requireResourcePermissionAsync,
} from "@/lib/route-handler";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/server/infrastructure/db";
import { workflowRuns } from "@/server/infrastructure/db/schema";
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
      const run = await getWorkflowRun(
        parsedParams.data.runId,
        parsedQuery.data.workspaceId,
      );
      const forbidden = await requireResourcePermissionAsync(
        session.user.id,
        parsedQuery.data.workspaceId,
        "workflows.view",
        "workflow",
        run.workflowId,
      );
      if (forbidden) return forbidden;
      return NextResponse.json({
        run,
      });
    },
    {
      logLabel: "Failed to read workflow run",
      expectedError: workflowErrorResponse,
    },
  );
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  return handleRoute(
    req,
    async ({ session }) => {
      const parsed = querySchema
        .extend({ status: z.literal("cancelled") })
        .safeParse(await req.json());
      const ids = paramsSchema.safeParse(await params);
      if (!parsed.success || !ids.success)
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
      const run = await getWorkflowRun(ids.data.runId, parsed.data.workspaceId);
      const forbidden = await requireResourcePermissionAsync(
        session.user.id,
        parsed.data.workspaceId,
        "workflows.execute",
        "workflow",
        run.workflowId,
      );
      if (forbidden) return forbidden;
      await db
        .update(workflowRuns)
        .set({ status: "cancelled", completedAt: new Date() })
        .where(
          and(
            eq(workflowRuns.id, run.id),
            inArray(workflowRuns.status, ["queued", "running"]),
          ),
        );
      return NextResponse.json({
        run: await getWorkflowRun(run.id, parsed.data.workspaceId),
      });
    },
    {
      logLabel: "Failed to cancel workflow run",
      expectedError: workflowErrorResponse,
    },
  );
}
