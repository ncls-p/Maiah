import {
  handleRoute,
  requireResourcePermissionAsync,
  requireWorkspaceMemberAsync,
} from "@/lib/route-handler";
import { canManageTenantGlobals } from "@/modules/admin/auth";
import {
  archiveDocument,
  readKnowledgeDocument,
  retryDocumentIngestion,
} from "@/modules/knowledge/use-cases";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const querySchema = z.object({ workspaceId: z.uuid() });

export async function GET(
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
      const parsedParams = z
        .object({ knowledgeBaseId: z.uuid(), documentId: z.uuid() })
        .safeParse(await params);
      if (!parsed.success || !parsedParams.success) {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
      }
      const forbidden = await requireWorkspaceMemberAsync(
        session.user.id,
        parsed.data.workspaceId,
      );
      if (forbidden) return forbidden;

      const document = await readKnowledgeDocument({
        ...parsedParams.data,
        workspaceId: parsed.data.workspaceId,
        userId: session.user.id,
      });
      if (!document) {
        return NextResponse.json(
          { error: "Document not found" },
          { status: 404 },
        );
      }
      return NextResponse.json({ document });
    },
    { logLabel: "Failed to read knowledge document" },
  );
}

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
      const forbidden = await requireResourcePermissionAsync(
        session.user.id,
        parsed.data.workspaceId,
        "knowledgeBases.manage",
        "knowledge_base",
        (await params).knowledgeBaseId,
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

export async function PATCH(
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
      const { knowledgeBaseId, documentId } = await params;
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
      await retryDocumentIngestion({
        documentId,
        knowledgeBaseId,
        workspaceId: parsed.data.workspaceId,
        userId: session.user.id,
        canManageGlobal,
      });
      return NextResponse.json({ ok: true });
    },
    {
      logLabel: "Failed to retry document",
      expectedError: (error) => {
        const msg =
          error instanceof Error ? error.message : "Internal server error";
        return NextResponse.json({ error: msg }, { status: 400 });
      },
    },
  );
}
