import { NextRequest, NextResponse } from "next/server";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  handleRoute,
  requireRequestPermissionScopeAsync,
  requireWorkspaceMemberAsync,
  requireWorkspacePermissionAsync,
} from "@/lib/route-handler";
import {
  canEditAgent,
  createAgent,
  getAgentDefaultPreferences,
  listAgents,
  normalizePromptSuggestions,
} from "@/modules/agent/use-cases";
import { agentRuntimePolicy } from "@/modules/agent/runtime-policy";
import {
  delegationBindingInputSchema,
  orchestrationPolicySchema,
} from "@/modules/agent/orchestration-policy";
import { DelegationBindingValidationError } from "@/modules/agent/delegation-use-cases";
import { ONBOARDING_TOOL_PRESET } from "@/modules/agent/onboarding-tools";
import { canManageTenantGlobals } from "@/modules/admin/auth";
import { hasWorkspacePermissionForRequest } from "@/modules/auth/workspace-access";
import { authorization } from "@/server/domain/services/authorization";
import { withResourceProvenance } from "@/modules/iam/resource-provenance";
import { getToolBindingsForVersion } from "@/modules/tool/use-cases";
import { db } from "@/server/infrastructure/db";
import {
  agentVersions,
  aiModels,
  workspaces,
} from "@/server/infrastructure/db/schema";
import { createAgentSchema, isUniqueConstraintError } from "./route.create-agent-schema";


export async function POST(req: NextRequest) {
  return handleRoute(
    req,
    async ({ session }) => {
      const body = await req.json();
      const parsed = createAgentSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Invalid input", details: parsed.error.issues },
          { status: 400 },
        );
      }
      const { workspaceId, ...input } = parsed.data;
      const [workspace] = await db
        .select()
        .from(workspaces)
        .where(eq(workspaces.id, workspaceId))
        .limit(1);
      if (!workspace) {
        return NextResponse.json(
          { error: "Workspace not found" },
          { status: 404 },
        );
      }
      const forbidden = await requireWorkspacePermissionAsync(
        session.user.id,
        workspaceId,
        "agents.create",
      );
      if (forbidden) return forbidden;
      const result = await createAgent({
        workspaceId,
        userId: session.user.id,
        canAdminCurate: await canManageTenantGlobals(session, workspaceId),
        ...input,
      });
      return NextResponse.json(result, { status: 201 });
    },
    {
      logLabel: "Failed to create agent",
      expectedError: (error) => {
        if (error instanceof DelegationBindingValidationError) {
          return NextResponse.json(
            { error: error.message, code: error.code },
            { status: 400 },
          );
        }
        if (isUniqueConstraintError(error)) {
          return NextResponse.json(
            { error: "Agent slug already exists in this workspace" },
            { status: 409 },
          );
        }
        if (
          error instanceof Error &&
          [
            "Provider not found",
            "Model not found",
            "Model requires a provider",
            "Tool not found",
            "Custom tool not found",
            "MCP tool not found",
            "Knowledge base not found",
            "Share target user not found",
            "Share target user is required",
            "Only orchestrators can configure delegation",
            "Orchestrators cannot be published to the marketplace yet",
          ].includes(error.message)
        ) {
          return NextResponse.json({ error: error.message }, { status: 400 });
        }
        return NextResponse.json(
          { error: "Internal server error" },
          { status: 500 },
        );
      },
    },
  );
}
