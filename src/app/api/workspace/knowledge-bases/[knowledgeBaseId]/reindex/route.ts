import {
  handleRoute,
  requireResourcePermissionAsync,
} from "@/lib/route-handler";
import { canManageTenantGlobals } from "@/modules/admin/auth";
import { reindexKnowledgeBaseDocuments } from "@/modules/knowledge/use-cases";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const bodySchema = z.object({ workspaceId: z.uuid() });

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ knowledgeBaseId: string }> },
) {
  return handleRoute(
    req,
    async ({ session }) => {
      const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
      if (!parsed.success) {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
      }
      const { knowledgeBaseId } = await params;
      const forbidden = await requireResourcePermissionAsync(
        session.user.id,
        parsed.data.workspaceId,
        "knowledgeBases.manage",
        "knowledge_base",
        knowledgeBaseId,
      );
      if (forbidden) return forbidden;
      const canManageGlobal = await canManageTenantGlobals(
        session,
        parsed.data.workspaceId,
      );
      const result = await reindexKnowledgeBaseDocuments({
        knowledgeBaseId,
        workspaceId: parsed.data.workspaceId,
        userId: session.user.id,
        canManageGlobal,
      });
      return NextResponse.json(result);
    },
    {
      logLabel: "Failed to reindex knowledge base",
      expectedError: (error) => {
        const msg =
          error instanceof Error ? error.message : "Internal server error";
        const status =
          error instanceof Error && error.message.includes("not found")
            ? 404
            : 400;
        return NextResponse.json({ error: msg }, { status });
      },
    },
  );
}
