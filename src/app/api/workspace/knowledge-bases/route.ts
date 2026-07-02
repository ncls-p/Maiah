import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  handleRoute,
  requireWorkspacePermissionAsync,
} from "@/lib/route-handler";
import { canManageTenantGlobals } from "@/modules/admin/auth";
import {
  createKnowledgeBase,
  listKnowledgeBases,
} from "@/modules/knowledge/use-cases";

const querySchema = z.object({ workspaceId: z.uuid() });
const createSchema = z.object({
  workspaceId: z.uuid(),
  name: z.string().min(1).max(255),
  description: z.string().max(2048).optional(),
  isGlobal: z.boolean().optional(),
});

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
        "knowledgeBases.viewAllowed",
      );
      if (forbidden) return forbidden;
      const canManageGlobal = await canManageTenantGlobals(
        session,
        parsed.data.workspaceId,
      );
      return NextResponse.json(
        await listKnowledgeBases(
          parsed.data.workspaceId,
          session.user.id,
          canManageGlobal,
        ),
      );
    },
    { logLabel: "Failed to list knowledge bases" },
  );
}

export async function POST(req: NextRequest) {
  return handleRoute(
    req,
    async ({ session }) => {
      const parsed = createSchema.safeParse(await req.json());
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
      const knowledgeBase = await createKnowledgeBase({
        ...parsed.data,
        isGlobal: parsed.data.isGlobal && canManageGlobal,
        userId: session.user.id,
      });
      return NextResponse.json(knowledgeBase, { status: 201 });
    },
    { logLabel: "Failed to create knowledge base" },
  );
}
