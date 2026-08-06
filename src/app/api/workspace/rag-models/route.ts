import { NextRequest,NextResponse } from "next/server";
import { z } from "zod";

import { handleRoute,requireRequestPermissionScopeAsync,requireWorkspaceMemberAsync } from "@/lib/route-handler";
import { discoverWorkspaceModels } from "@/modules/provider/use-cases";

const querySchema = z.object({ workspaceId: z.uuid() });

/**
 * Live, credential-safe catalog for RAG configuration. Provider adapters are
 * responsible for translating discovery to their API; OpenAI-compatible
 * providers use GET /models.
 */
export async function GET(req: NextRequest) {
  return handleRoute(
    req,
    async ({ session }) => {
      const parsed = querySchema.safeParse({
        workspaceId: req.nextUrl.searchParams.get("workspaceId"),
      });
      if (!parsed.success) {
        return NextResponse.json({ error: "workspaceId must be a valid UUID" }, { status: 400 });
      }

      const scopeForbidden = await requireRequestPermissionScopeAsync(session.user.id, parsed.data.workspaceId, "providers.viewMetadata");
      if (scopeForbidden) return scopeForbidden;
      const memberForbidden = await requireWorkspaceMemberAsync(session.user.id, parsed.data.workspaceId);
      if (memberForbidden) return memberForbidden;

      return NextResponse.json({
        providers: await discoverWorkspaceModels(parsed.data.workspaceId),
      });
    },
    { logLabel: "Failed to discover RAG models" },
  );
}
