import { NextRequest,NextResponse } from "next/server";
import { z } from "zod";

import {
handleRoute,
requireRequestPermissionScopeAsync,
requireWorkspaceMemberAsync,
} from "@/lib/route-handler";
import { getDefaultRagConfig } from "@/modules/knowledge/rag-config";

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
          { error: "workspaceId must be a valid UUID" },
          { status: 400 },
        );
      }
      const scopeForbidden = await requireRequestPermissionScopeAsync(
        session.user.id,
        parsed.data.workspaceId,
        "knowledgeBases.viewAllowed",
      );
      if (scopeForbidden) return scopeForbidden;
      const memberForbidden = await requireWorkspaceMemberAsync(
        session.user.id,
        parsed.data.workspaceId,
      );
      if (memberForbidden) return memberForbidden;

      return NextResponse.json(await getDefaultRagConfig());
    },
    { logLabel: "Failed to read default RAG configuration" },
  );
}
