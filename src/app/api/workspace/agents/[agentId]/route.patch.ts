import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import {
  handleRoute,
  requireResourcePermissionAsync,
} from "@/lib/route-handler";
import { db } from "@/server/infrastructure/db";
import { users } from "@/server/infrastructure/db/schema";
import {
  archiveAgent,
  AgentVersionConflictError,
  canEditAgent,
  getVisibleAgentById,
  normalizePromptSuggestions,
  updateAgent,
} from "@/modules/agent/use-cases";
import { agentRuntimePolicy } from "@/modules/agent/runtime-policy";
import { canManageTenantGlobals } from "@/modules/admin/auth";
import { hasWorkspacePermissionForRequest } from "@/modules/auth/workspace-access";
import { toolBindingInputSchema } from "@/modules/tool/use-cases";
import { authorization } from "@/server/domain/services/authorization";
import { withResourceProvenance } from "@/modules/iam/resource-provenance";
import {
  delegationBindingInputSchema,
  orchestrationPolicySchema,
} from "@/modules/agent/orchestration-policy";
import { DelegationBindingValidationError } from "@/modules/agent/delegation-use-cases";
import { isUniqueConstraintError, routeParamsSchema, updateAgentSchema, workspaceQuerySchema } from "./route.route-params-schema";


export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  return handleRoute(
    req,
    async ({ session }) => {
      const parsedParams = routeParamsSchema.safeParse(await params);
      const body = await req.json();
      const parsedBody = updateAgentSchema.safeParse(body);
      if (!parsedParams.success || !parsedBody.success) {
        return NextResponse.json(
          {
            error: "Invalid input",
            details: parsedBody.success ? undefined : parsedBody.error.issues,
          },
          { status: 400 },
        );
      }
      const { agentId } = parsedParams.data;
      const { workspaceId, ...input } = parsedBody.data;
      const canAdminCurate = await canManageTenantGlobals(session, workspaceId);
      const forbidden = await requireResourcePermissionAsync(
        session.user.id,
        workspaceId,
        "agents.update",
        "agent",
        (await params).agentId,
      );
      if (forbidden) return forbidden;
      const { agent, version } = await updateAgent({
        agentId,
        workspaceId,
        userId: session.user.id,
        canAdminCurate,
        ...input,
        shareTargetEmail: input.shareTargetEmail || undefined,
      });
      return NextResponse.json({
        agent: {
          ...agent,
          promptSuggestions: normalizePromptSuggestions(
            agent.promptSuggestionsJson,
          ),
        },
        version,
      });
    },
    {
      logLabel: "Failed to update agent",
      expectedError: (error) => {
        if (error instanceof DelegationBindingValidationError) {
          return NextResponse.json(
            { error: error.message, code: error.code },
            { status: 400 },
          );
        }
        if (error instanceof AgentVersionConflictError) {
          return NextResponse.json(
            {
              error: error.message,
              code: error.code,
              currentVersionId: error.currentVersionId,
            },
            { status: 409 },
          );
        }
        if (isUniqueConstraintError(error)) {
          return NextResponse.json(
            { error: "Agent slug already exists in this workspace" },
            { status: 409 },
          );
        }
        if ((error as Error).message === "Agent not found") {
          return NextResponse.json(
            { error: "Agent not found" },
            { status: 404 },
          );
        }
        if (
          error instanceof Error &&
          error.message === "Only the creator or an admin can update this agent"
        ) {
          return NextResponse.json({ error: error.message }, { status: 403 });
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
            "Skill not found",
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

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  return handleRoute(
    req,
    async ({ session }) => {
      const parsedParams = routeParamsSchema.safeParse(await params);
      const { searchParams } = req.nextUrl;
      const parsedQuery = workspaceQuerySchema.safeParse({
        workspaceId: searchParams.get("workspaceId"),
      });
      if (!parsedParams.success || !parsedQuery.success) {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
      }
      const { agentId } = parsedParams.data;
      const { workspaceId } = parsedQuery.data;
      const forbidden = await requireResourcePermissionAsync(
        session.user.id,
        workspaceId,
        "agents.delete",
        "agent",
        (await params).agentId,
      );
      if (forbidden) return forbidden;
      await archiveAgent(
        agentId,
        workspaceId,
        session.user.id,
        await canManageTenantGlobals(session, workspaceId),
      );
      return NextResponse.json({ ok: true });
    },
    {
      logLabel: "Failed to archive agent",
      expectedError: (error) => {
        if ((error as Error).message === "Agent not found") {
          return NextResponse.json(
            { error: "Agent not found" },
            { status: 404 },
          );
        }
        if (
          (error as Error).message ===
          "Only the creator or an admin can delete this agent"
        ) {
          return NextResponse.json(
            { error: (error as Error).message },
            { status: 403 },
          );
        }
        return NextResponse.json(
          { error: "Internal server error" },
          { status: 500 },
        );
      },
    },
  );
}
