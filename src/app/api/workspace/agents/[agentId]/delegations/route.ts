import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  handleRoute,
  requireWorkspacePermissionAsync,
} from "@/lib/route-handler";
import { canManageTenantGlobals } from "@/modules/admin/auth";
import {
  DelegationBindingValidationError,
  getDelegationBindingsForVersion,
} from "@/modules/agent/delegation-use-cases";
import {
  delegationBindingInputSchema,
  normalizeOrchestrationPolicy,
  orchestrationPolicySchema,
} from "@/modules/agent/orchestration-policy";
import {
  AgentVersionConflictError,
  getActiveVersion,
  getAgentVersionById,
  getVisibleAgentById,
  listAgents,
  updateAgent,
} from "@/modules/agent/use-cases";
import { audit } from "@/server/domain/services/audit";
import { db } from "@/server/infrastructure/db";

const routeParamsSchema = z.object({ agentId: z.uuid() });
const querySchema = z.object({
  workspaceId: z.uuid(),
  versionId: z.uuid().optional(),
});
const updateSchema = z.object({
  baseVersionId: z.uuid().nullable(),
  policy: orchestrationPolicySchema,
  bindings: z.array(delegationBindingInputSchema),
});

async function resolveRequest(req: NextRequest, rawParams: unknown) {
  const parsedParams = routeParamsSchema.safeParse(rawParams);
  const parsedQuery = querySchema.safeParse({
    workspaceId: req.nextUrl.searchParams.get("workspaceId"),
    versionId: req.nextUrl.searchParams.get("versionId") ?? undefined,
  });
  if (!parsedParams.success || !parsedQuery.success) return null;
  return { ...parsedParams.data, ...parsedQuery.data };
}

async function serializeDelegationConfig(input: {
  agentId: string;
  workspaceId: string;
  userId: string;
  canAdminCurate: boolean;
  versionId?: string;
}) {
  const version = input.versionId
    ? await getAgentVersionById(input.versionId)
    : await getActiveVersion(input.agentId);
  if (version && version.agentId !== input.agentId) return null;
  if (!version) return { version: null, policy: null, bindings: [] };

  const [bindings, visibleAgents] = await Promise.all([
    getDelegationBindingsForVersion(version.id, db),
    listAgents(input.workspaceId, input.userId, input.canAdminCurate),
  ]);
  const pinnedVersions = await Promise.all(
    bindings.map((binding) => getAgentVersionById(binding.childAgentVersionId)),
  );
  const pinnedVersionById = new Map(
    pinnedVersions.flatMap((childVersion) =>
      childVersion ? [[childVersion.id, childVersion] as const] : [],
    ),
  );
  const visibleById = new Map(visibleAgents.map((agent) => [agent.id, agent]));
  return {
    version: { id: version.id, versionNumber: version.versionNumber },
    policy: version.orchestrationPolicyJson
      ? normalizeOrchestrationPolicy(version.orchestrationPolicyJson)
      : null,
    bindings: bindings.map((binding) => {
      const child = visibleById.get(binding.childAgentId);
      const childVersion = pinnedVersionById.get(binding.childAgentVersionId);
      return {
        ...binding,
        childVersion:
          child && childVersion
            ? {
                id: childVersion.id,
                versionNumber: childVersion.versionNumber,
                name: childVersion.name,
                isActive: child?.activeVersionId === childVersion.id,
              }
            : null,
        childAgent: child
          ? {
              id: child.id,
              name: child.name,
              kind: child.kind,
              activeVersionId: child.activeVersionId,
            }
          : null,
      };
    }),
  };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  return handleRoute(
    req,
    async ({ session }) => {
      const request = await resolveRequest(req, await params);
      if (!request) {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
      }
      const forbidden = await requireWorkspacePermissionAsync(
        session.user.id,
        request.workspaceId,
        "agents.get",
      );
      if (forbidden) return forbidden;
      const canAdminCurate = await canManageTenantGlobals(
        session,
        request.workspaceId,
      );
      const agent = await getVisibleAgentById(
        request.agentId,
        request.workspaceId,
        session.user.id,
        canAdminCurate,
      );
      if (!agent) {
        return NextResponse.json({ error: "Agent not found" }, { status: 404 });
      }
      const config = await serializeDelegationConfig({
        ...request,
        userId: session.user.id,
        canAdminCurate,
      });
      if (!config) {
        return NextResponse.json(
          { error: "Version not found" },
          { status: 404 },
        );
      }
      return NextResponse.json({ kind: agent.kind, ...config });
    },
    { logLabel: "Failed to list agent delegations" },
  );
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  return handleRoute(
    req,
    async ({ session }) => {
      const request = await resolveRequest(req, await params);
      const body = updateSchema.safeParse(await req.json());
      if (!request || !body.success) {
        return NextResponse.json(
          {
            error: "Invalid request",
            details: body.success ? undefined : body.error.issues,
          },
          { status: 400 },
        );
      }
      const forbidden = await requireWorkspacePermissionAsync(
        session.user.id,
        request.workspaceId,
        "agents.update",
      );
      if (forbidden) return forbidden;
      const canAdminCurate = await canManageTenantGlobals(
        session,
        request.workspaceId,
      );
      const agent = await getVisibleAgentById(
        request.agentId,
        request.workspaceId,
        session.user.id,
        canAdminCurate,
      );
      if (!agent) {
        return NextResponse.json({ error: "Agent not found" }, { status: 404 });
      }
      if (agent.kind !== "orchestrator") {
        return NextResponse.json(
          { error: "Only orchestrators can configure delegation" },
          { status: 400 },
        );
      }

      const { version } = await updateAgent({
        agentId: request.agentId,
        workspaceId: request.workspaceId,
        userId: session.user.id,
        canAdminCurate,
        baseVersionId: body.data.baseVersionId,
        orchestrationPolicy: body.data.policy,
        delegationBindings: body.data.bindings,
      });
      await audit.emit({
        workspaceId: request.workspaceId,
        actorPrincipalType: "user",
        actorPrincipalId: session.user.id,
        action: "agent.delegations.updated",
        resourceType: "agent",
        resourceId: request.agentId,
        outcome: "success",
        metadata: {
          versionId: version.id,
          versionNumber: version.versionNumber,
          bindingCount: body.data.bindings.length,
        },
      });
      const config = await serializeDelegationConfig({
        agentId: request.agentId,
        workspaceId: request.workspaceId,
        userId: session.user.id,
        canAdminCurate,
        versionId: version.id,
      });
      return NextResponse.json({ kind: agent.kind, ...config });
    },
    {
      logLabel: "Failed to update agent delegations",
      expectedError: (error) => {
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
        if (error instanceof DelegationBindingValidationError) {
          return NextResponse.json(
            { error: error.message, code: error.code },
            { status: 400 },
          );
        }
        if (error instanceof Error && error.message === "Agent not found") {
          return NextResponse.json({ error: error.message }, { status: 404 });
        }
        if (
          error instanceof Error &&
          error.message === "Only the creator or an admin can update this agent"
        ) {
          return NextResponse.json({ error: error.message }, { status: 403 });
        }
        return NextResponse.json(
          { error: "Internal server error" },
          { status: 500 },
        );
      },
    },
  );
}
