import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  handleRoute,
  requireResourcePermissionAsync,
} from "@/lib/route-handler";
import { canManageTenantGlobals } from "@/modules/admin/auth";
import {
  ingestTextDocument,
  listDocuments,
} from "@/modules/knowledge/use-cases";
import { extractKnowledgeUploads } from "@/modules/knowledge/file-ingestion";

const querySchema = z.object({ workspaceId: z.uuid() });
const createSchema = z.object({
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

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ knowledgeBaseId: string }> },
) {
  return handleRoute(
    req,
    async ({ session }) => {
      const { knowledgeBaseId } = await params;
      const isMultipart = req.headers
        .get("content-type")
        ?.toLowerCase()
        .startsWith("multipart/form-data");
      if (isMultipart) {
        const form = await req.formData();
        const workspaceId = z.uuid().safeParse(form.get("workspaceId"));
        const uploads = form
          .getAll("files")
          .filter((value): value is File => value instanceof File);
        if (!workspaceId.success || uploads.length === 0) {
          return NextResponse.json(
            { error: "Invalid upload" },
            { status: 400 },
          );
        }
        const forbidden = await requireResourcePermissionAsync(
          session.user.id,
          workspaceId.data,
          "knowledgeBases.manage",
          "knowledge_base",
          knowledgeBaseId,
        );
        if (forbidden) return forbidden;
        const canManageGlobal = await canManageTenantGlobals(
          session,
          workspaceId.data,
        );
        let extracted: Awaited<ReturnType<typeof extractKnowledgeUploads>>;
        try {
          extracted = await extractKnowledgeUploads(
            await Promise.all(
              uploads.map(async (file) => ({
                fileName: file.name,
                mimeType: file.type || undefined,
                bytes: new Uint8Array(await file.arrayBuffer()),
              })),
            ),
          );
        } catch (error) {
          return NextResponse.json(
            {
              error:
                error instanceof Error ? error.message : "Invalid upload batch",
            },
            { status: 400 },
          );
        }
        const documents = [];
        for (const file of extracted.files) {
          documents.push(
            await ingestTextDocument({
              workspaceId: workspaceId.data,
              knowledgeBaseId,
              userId: session.user.id,
              canManageGlobal,
              title: file.title,
              content: file.content,
              sourceType: "upload",
              mimeType: file.mimeType,
            }),
          );
        }
        return NextResponse.json(
          { documents, rejected: extracted.rejected },
          { status: extracted.rejected.length > 0 ? 207 : 201 },
        );
      }

      const parsed = createSchema.safeParse(await req.json());
      if (!parsed.success)
        return NextResponse.json(
          { error: "Invalid input", details: parsed.error.issues },
          { status: 400 },
        );
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
      const document = await ingestTextDocument({
        knowledgeBaseId,
        userId: session.user.id,
        canManageGlobal,
        ...parsed.data,
      });
      return NextResponse.json(document, { status: 201 });
    },
    {
      logLabel: "Failed to ingest document",
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
