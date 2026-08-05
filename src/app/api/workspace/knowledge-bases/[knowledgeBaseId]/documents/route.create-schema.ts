import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  handleRoute,
  requireResourcePermissionAsync,
} from "@/lib/route-handler";
import { canManageTenantGlobals } from "@/modules/admin/auth";
import {
  getKnowledgeBase,
  ingestTextDocument,
  listDocuments,
} from "@/modules/knowledge/use-cases";
import { extractKnowledgeUploads } from "@/modules/knowledge/file-ingestion";
import { getDefaultRagConfig } from "@/modules/knowledge/rag-config";
import { parseRagConfig } from "@/modules/knowledge/rag-config-schema";
import {
  assembleDocumentUpload,
  parseChunkMetadata,
  parseCompletionMetadata,
  storeDocumentUploadChunk,
} from "@/modules/document-upload/server";

const querySchema = z.object({ workspaceId: z.uuid() });
export const createSchema = z.object({
  workspaceId: z.uuid(),
  title: z.string().min(1).max(512),
  content: z.string().min(1).max(2_000_000),
  sourceType: z.enum(["text", "url"]).optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ knowledgeBaseId: string }> },
) {
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
      const forbidden = await requireResourcePermissionAsync(
        session.user.id,
        parsed.data.workspaceId,
        "knowledgeBases.viewAllowed",
        "knowledge_base",
        (await params).knowledgeBaseId,
      );
      if (forbidden) return forbidden;
      const { knowledgeBaseId } = await params;
      return NextResponse.json(
        await listDocuments(
          knowledgeBaseId,
          parsed.data.workspaceId,
          session.user.id,
        ),
      );
    },
    {
      logLabel: "Failed to list documents",
      expectedError: (error) => {
        const msg =
          error instanceof Error ? error.message : "Internal server error";
        const status =
          error instanceof Error && error.message.includes("not found")
            ? 404
            : 500;
        return NextResponse.json({ error: msg }, { status });
      },
    },
  );
}
