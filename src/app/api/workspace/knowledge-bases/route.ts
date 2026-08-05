import {
handleRoute,
requireRequestPermissionScopeAsync,
requireWorkspaceMemberAsync,
requireWorkspacePermissionAsync,
} from "@/lib/route-handler";
import { canManageTenantGlobals } from "@/modules/admin/auth";
import { hasWorkspacePermissionForRequest } from "@/modules/auth/workspace-access";
import { withResourceProvenance } from "@/modules/iam/resource-provenance";
import { ragConfigSchema } from "@/modules/knowledge/rag-config";
import {
createKnowledgeBase,
listKnowledgeBases,
RagModelConfigurationPermissionError,
} from "@/modules/knowledge/use-cases";
import { NextRequest,NextResponse } from "next/server";
import { z } from "zod";

const querySchema = z.object({ workspaceId: z.uuid() });
const createSchema = z.object({
  workspaceId: z.uuid(),
  name: z.string().min(1).max(255),
  description: z.string().max(2048).optional(),
  isGlobal: z.boolean().optional(),
  ragConfig: ragConfigSchema.optional(),
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
      const scopeForbidden = await requireRequestPermissionScopeAsync(
        session.user.id,
        parsed.data.workspaceId,
        "knowledgeBases.viewAllowed",
      );
      if (scopeForbidden) return scopeForbidden;
      const forbidden = await requireWorkspaceMemberAsync(
        session.user.id,
        parsed.data.workspaceId,
      );
      if (forbidden) return forbidden;
      const canManageGlobal = await canManageTenantGlobals(
        session,
        parsed.data.workspaceId,
      );
      const knowledgeBases = await listKnowledgeBases(
        parsed.data.workspaceId,
        session.user.id,
        canManageGlobal,
      );
      return NextResponse.json(
        await withResourceProvenance(
          knowledgeBases,
          parsed.data.workspaceId,
          session.user.id,
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
      const canManageModels = await hasWorkspacePermissionForRequest(
        session.user.id,
        parsed.data.workspaceId,
        "models.manage",
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
        canManageModels,
        userId: session.user.id,
      });
      const [knowledgeBaseWithProvenance] = await withResourceProvenance(
        [knowledgeBase],
        parsed.data.workspaceId,
        session.user.id,
      );
      return NextResponse.json(knowledgeBaseWithProvenance, { status: 201 });
    },
    {
      logLabel: "Failed to create knowledge base",
      expectedError: (error) =>
        error instanceof RagModelConfigurationPermissionError
          ? NextResponse.json({ error: error.message }, { status: 403 })
          : NextResponse.json(
              { error: "Failed to create knowledge base" },
              { status: 500 },
            ),
    },
  );
}
