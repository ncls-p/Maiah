import { handleRoute,requireResourcePermissionAsync } from "@/lib/route-handler";
import { canManageTenantGlobals } from "@/modules/admin/auth";
import { AgentVersionConflictError,getActiveVersion,updateAgent } from "@/modules/agent/use-cases";
import { getKnowledgeBindingsForVersion } from "@/modules/knowledge/use-cases";
import { NextRequest,NextResponse } from "next/server";
import { z } from "zod";
import { getAuthorizedAgent } from "../agent-route-access";

const routeParamsSchema = z.object({ agentId: z.uuid() });
const putSchema = z.object({
  workspaceId: z.uuid(),
  baseVersionId: z.uuid().nullable(),
  knowledgeBaseIds: z.array(z.uuid()),
});

export async function GET(req: NextRequest, { params }: { params: Promise<{ agentId: string }> }) {
  return handleRoute(
    req,
    async ({ session }) => {
      const access = await getAuthorizedAgent(req, params, session, "agents.get");
      if (!access.ok) return access.response;
      const { agentId, workspaceId } = access;
      const version = await getActiveVersion(agentId);
      if (!version) {
        return NextResponse.json({ bindings: [] });
      }
      const bindings = await getKnowledgeBindingsForVersion(version.id, {
        workspaceId,
        userId: session.user.id,
      });
      return NextResponse.json({ bindings });
    },
    { logLabel: "Failed to get knowledge bindings" },
  );
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ agentId: string }> }) {
  return handleRoute(
    req,
    async ({ session }) => {
      const parsedParams = routeParamsSchema.safeParse(await params);
      const body = await req.json();
      const parsedBody = putSchema.safeParse(body);
      if (!parsedParams.success || !parsedBody.success) {
        return NextResponse.json({ error: "Invalid input" }, { status: 400 });
      }
      const { agentId } = parsedParams.data;
      const { workspaceId, knowledgeBaseIds } = parsedBody.data;
      const forbidden = await requireResourcePermissionAsync(session.user.id, workspaceId, "agents.update", "agent", (await params).agentId);
      if (forbidden) return forbidden;
      const { version } = await updateAgent({
        agentId,
        workspaceId,
        userId: session.user.id,
        baseVersionId: parsedBody.data.baseVersionId,
        canAdminCurate: await canManageTenantGlobals(session, workspaceId),
        knowledgeBindings: knowledgeBaseIds,
      });
      const bindings = await getKnowledgeBindingsForVersion(version.id);
      return NextResponse.json({ version, bindings });
    },
    {
      logLabel: "Failed to update knowledge bindings",
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
        if (error instanceof Error && error.message === "Knowledge base not found") {
          return NextResponse.json({ error: "Knowledge base not found" }, { status: 400 });
        }
        if (error instanceof Error && error.message === "Only the creator or an admin can update this agent") {
          return NextResponse.json({ error: error.message }, { status: 403 });
        }
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
      },
    },
  );
}
