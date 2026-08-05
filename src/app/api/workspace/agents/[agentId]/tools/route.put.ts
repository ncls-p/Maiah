import { handleRoute,requireResourcePermissionAsync } from "@/lib/route-handler";
import { canManageTenantGlobals } from "@/modules/admin/auth";
import { AgentVersionConflictError,getVisibleAgentById,updateAgent } from "@/modules/agent/use-cases";
import { getToolBindingsForVersion,toolBindingInputSchema } from "@/modules/tool/use-cases";
import { audit } from "@/server/domain/services/audit";
import { NextRequest,NextResponse } from "next/server";
import { z } from "zod";
import { querySchema,routeParamsSchema } from "./route.route-params-schema";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ agentId: string }> }) {
  return handleRoute(
    req,
    async ({ session }) => {
      const parsedParams = routeParamsSchema.safeParse(await params);
      const { searchParams } = req.nextUrl;
      const parsedQuery = querySchema.safeParse({
        workspaceId: searchParams.get("workspaceId"),
        versionId: searchParams.get("versionId") ?? undefined,
      });
      if (!parsedParams.success || !parsedQuery.success) {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
      }
      const { agentId } = parsedParams.data;
      const { workspaceId } = parsedQuery.data;
      const forbidden = await requireResourcePermissionAsync(session.user.id, workspaceId, "agents.update", "agent", (await params).agentId);
      if (forbidden) return forbidden;
      const canAdminCurate = await canManageTenantGlobals(session, workspaceId);
      const agent = await getVisibleAgentById(agentId, workspaceId, session.user.id, canAdminCurate);
      if (!agent) {
        return NextResponse.json({ error: "Agent not found" }, { status: 404 });
      }
      if (!agent.activeVersionId) {
        return NextResponse.json({ error: "No active version to bind tools to" }, { status: 400 });
      }
      const body = await req.json();
      const parsedBody = z
        .object({
          baseVersionId: z.uuid().nullable(),
          bindings: z.array(toolBindingInputSchema),
        })
        .safeParse(body);
      if (!parsedBody.success) {
        return NextResponse.json({ error: "Invalid request body", details: parsedBody.error.issues }, { status: 400 });
      }
      const { version } = await updateAgent({
        agentId,
        workspaceId,
        userId: session.user.id,
        baseVersionId: parsedBody.data.baseVersionId,
        canAdminCurate,
        toolBindings: parsedBody.data.bindings,
      });
      await audit.emit({
        workspaceId,
        actorPrincipalType: "user",
        actorPrincipalId: session.user.id,
        action: "agent.tools.updated",
        resourceType: "agent",
        resourceId: agentId,
        outcome: "success",
        metadata: {
          versionId: version.id,
          versionNumber: version.versionNumber,
          bindingCount: parsedBody.data.bindings.length,
        },
      });
      const bindings = await getToolBindingsForVersion(version.id);
      return NextResponse.json({ version, bindings });
    },
    {
      logLabel: "Failed to update agent tools",
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
        if (error instanceof Error && error.message === "Agent not found") {
          return NextResponse.json({ error: "Agent not found" }, { status: 404 });
        }
        if (error instanceof Error && ["Tool not found", "Custom tool not found", "MCP tool not found"].includes(error.message)) {
          return NextResponse.json({ error: error.message }, { status: 400 });
        }
        if (error instanceof Error && error.message === "Only the creator or an admin can update this agent") {
          return NextResponse.json({ error: error.message }, { status: 403 });
        }
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
      },
    },
  );
}
