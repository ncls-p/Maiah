import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  handleRoute,
  requireWorkspacePermissionAsync,
} from "@/lib/route-handler";
import { canManageTenantGlobals } from "@/modules/admin/auth";
import {
  archiveKnowledgeBase,
  getKnowledgeBase,
  updateKnowledgeBase,
} from "@/modules/knowledge/use-cases";

const querySchema = z.object({ workspaceId: z.uuid() });
const updateSchema = z.object({
  workspaceId: z.uuid(),
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2048).optional(),
  isGlobal: z.boolean().optional(),
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
      const forbidden = await requireWorkspacePermissionAsync(
        session.user.id,
        parsed.data.workspaceId,
        "knowledgeBases.viewAllowed",
      );
      if (forbidden) return forbidden;
      const { knowledgeBaseId } = await params;
      const knowledgeBase = await getKnowledgeBase(
        knowledgeBaseId,
        parsed.data.workspaceId,
        session.user.id,
      );
      if (!knowledgeBase)
        return NextResponse.json(
          { error: "Knowledge base not found" },
          { status: 404 },
        );
      return NextResponse.json(knowledgeBase);
    },
    { logLabel: "Failed to get knowledge base" },
  );
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ knowledgeBaseId: string }> },
) {
  return handleRoute(
    req,
    async ({ session }) => {
      const parsed = updateSchema.safeParse(await req.json());
      if (!parsed.success)
        return NextResponse.json(
          { error: "Invalid input", details: parsed.error.issues },
          { status: 400 },
        );
      const forbidden = await requireWorkspacePermissionAsync(
        session.user.id,
        parsed.data.workspaceId,
        "knowledgeBases.manage",
      );
      if (forbidden) return forbidden;
      const { knowledgeBaseId } = await params;
      const canManageGlobal = await canManageTenantGlobals(
        session,
        parsed.data.workspaceId,
      );
      if (parsed.data.isGlobal && !canManageGlobal) {
        return NextResponse.json(
          { error: "Only admins can make knowledge bases global" },
          { status: 403 },
        );
      }
      return NextResponse.json(
        await updateKnowledgeBase({
          knowledgeBaseId,
          userId: session.user.id,
          canManageGlobal,
          ...parsed.data,
        }),
      );
    },
    {
      logLabel: "Failed to update knowledge base",
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

export async function DELETE(
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
      const forbidden = await requireWorkspacePermissionAsync(
        session.user.id,
        parsed.data.workspaceId,
        "knowledgeBases.manage",
      );
      if (forbidden) return forbidden;
      const { knowledgeBaseId } = await params;
      const canManageGlobal = await canManageTenantGlobals(
        session,
        parsed.data.workspaceId,
      );
      await archiveKnowledgeBase(
        knowledgeBaseId,
        parsed.data.workspaceId,
        session.user.id,
        canManageGlobal,
      );
      return NextResponse.json({ ok: true });
    },
    {
      logLabel: "Failed to archive knowledge base",
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
