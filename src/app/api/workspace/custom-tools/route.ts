import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  handleRoute,
  requireWorkspacePermissionAsync,
} from "@/lib/route-handler";
import { canManageTenantGlobals } from "@/modules/admin/auth";
import { listCustomTools } from "@/modules/custom-tools/use-cases";

const querySchema = z.object({ workspaceId: z.uuid() });

export async function GET(req: NextRequest) {
  return handleRoute(
    req,
    async ({ session }) => {
      const parsed = querySchema.safeParse({
        workspaceId: req.nextUrl.searchParams.get("workspaceId"),
      });
      if (!parsed.success)
        return NextResponse.json(
          { error: "workspaceId must be a valid UUID" },
          { status: 400 },
        );

      const forbidden = await requireWorkspacePermissionAsync(
        session.user.id,
        parsed.data.workspaceId,
        "tools.view",
      );
      if (forbidden) return forbidden;

      const canManageGlobal = await canManageTenantGlobals(
        session,
        parsed.data.workspaceId,
      );
      return NextResponse.json(
        await listCustomTools(
          parsed.data.workspaceId,
          session.user.id,
          canManageGlobal,
        ),
      );
    },
    { logLabel: "Failed to list custom tools" },
  );
}
