import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  handleRoute,
  requireWorkspacePermissionAsync,
} from "@/lib/route-handler";
import { listWorkflowTools } from "@/modules/workflows/tool-catalog";

export async function GET(req: NextRequest) {
  return handleRoute(
    req,
    async ({ session }) => {
      const parsed = z
        .uuid()
        .safeParse(req.nextUrl.searchParams.get("workspaceId"));
      if (!parsed.success)
        return NextResponse.json(
          { error: "Invalid workspace" },
          { status: 400 },
        );
      const forbidden = await requireWorkspacePermissionAsync(
        session.user.id,
        parsed.data,
        "workflows.view",
      );
      if (forbidden) return forbidden;
      return NextResponse.json({
        tools: await listWorkflowTools(parsed.data, session.user.id),
      });
    },
    { logLabel: "Failed to list workflow tools" },
  );
}
