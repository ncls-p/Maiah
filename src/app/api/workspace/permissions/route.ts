import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  handleRoute,
  requireWorkspacePermissionAsync,
} from "@/lib/route-handler";
import { hasWorkspacePermissionForRequest } from "@/modules/auth/workspace-access";

const querySchema = z.object({ workspaceId: z.uuid() });

const permissionNames = [
  "usage.view",
  "audit.view",
  "providers.viewMetadata",
  "providers.update",
  "models.manage",
  "tools.configure",
  "tools.view",
  "mcpServers.get",
  "mcpServers.manage",
  "knowledgeBases.manage",
  "agents.create",
  "agents.delegate",
  "apiKeys.manage",
  "apiKeys.manageOwn",
  "workspaces.update",
  "roles.manage",
  "workflows.view",
] as const;

export async function GET(req: NextRequest) {
  return handleRoute(
    req,
    async ({ session }) => {
      const parsed = querySchema.safeParse({
        workspaceId: req.nextUrl.searchParams.get("workspaceId"),
      });
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Invalid input", details: parsed.error.issues },
          { status: 400 },
        );
      }

      const { workspaceId } = parsed.data;
      const forbidden = await requireWorkspacePermissionAsync(
        session.user.id,
        workspaceId,
        "workspaces.get",
      );
      if (forbidden) return forbidden;

      const results = await Promise.all(
        permissionNames.map((name) =>
          hasWorkspacePermissionForRequest(session.user.id, workspaceId, name),
        ),
      );

      const [
        canViewUsage,
        canViewAudit,
        canViewProviders,
        canManageProviderSettings,
        canManageModels,
        canConfigureTools,
        canViewTools,
        canGetMcpServers,
        canManageMcpServers,
        canManageKnowledgeBases,
        canCreateAgent,
        canDelegateAgents,
        canManageApiKeys,
        canManageOwnApiKeys,
        canManageWorkspace,
        canManageTenantGlobals,
        canViewWorkflows,
      ] = results;

      return NextResponse.json({
        canViewUsage,
        canViewAudit,
        canViewProviders,
        canManageProviders: canManageProviderSettings && canManageModels,
        canConfigureTools,
        canViewTools,
        canGetMcpServers,
        canManageMcpServers,
        canManageKnowledgeBases,
        canCreateAgent,
        canDelegateAgents,
        canManageApiKeys: canManageApiKeys || canManageOwnApiKeys,
        canManageWorkspace,
        canManageTenantGlobals,
        canViewWorkflows,
      });
    },
    { logLabel: "Failed to read workspace permissions" },
  );
}
