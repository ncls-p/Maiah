import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  handleRoute,
  requireWorkspacePermissionAsync,
} from "@/lib/route-handler";
import { canManageTenantGlobals } from "@/modules/admin/auth";
import { archiveDocument } from "@/modules/knowledge/use-cases";

const querySchema = z.object({ workspaceId: z.uuid() });

export async function DELETE(
  req: NextRequest,
  {
    params,
  }: { params: Promise<{ knowledgeBaseId: string; documentId: string }> },
) {
  return handleRoute(
    req,
    async ({ session }) => {
      const parsed = querySchema.safeParse({
        workspaceId: req.nextUrl.searchParams.get("workspaceId"),
      });
      if (!parsed.success) {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
      }
      const forbidden = await requireWorkspacePermissionAsync(
        session.user.id,
        parsed.data.workspaceId,
        "knowledgeBases.manage",
      );
      if (forbidden) return forbidden;
      const { knowledgeBaseId, documentId } = await params;
      const canManageGlobal = await canManageTenantGlobals(
        session,
        parsed.data.workspaceId,
      );
      await archiveDocument({
        documentId,
        knowledgeBaseId,
        workspaceId: parsed.data.workspaceId,
        userId: session.user.id,
        canManageGlobal,
      });
      return NextResponse.json({ ok: true });
    },
    {
      logLabel: "Failed to archive document",
      expectedError: (error) => {
        const msg =
          error instanceof Error ? error.message : "Internal server error";
        return NextResponse.json({ error: msg }, { status: 400 });
      },
    },
  );
}
