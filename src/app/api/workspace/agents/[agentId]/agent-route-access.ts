import { requireResourcePermissionAsync } from "@/lib/route-handler";
import { canManageTenantGlobals } from "@/modules/admin/auth";
import { getVisibleAgentById } from "@/modules/agent/use-cases";
import { NextRequest,NextResponse } from "next/server";
import { z } from "zod";

const routeParamsSchema = z.object({ agentId: z.uuid() });
const workspaceQuerySchema = z.object({ workspaceId: z.uuid() });

export async function getAuthorizedAgent(req: NextRequest, params: Promise<{ agentId: string }>, session: NonNullable<Parameters<typeof canManageTenantGlobals>[0]>, permission: "agents.get" | "agents.update") {
  const parsedParams = routeParamsSchema.safeParse(await params);
  const parsedQuery = workspaceQuerySchema.safeParse({ workspaceId: req.nextUrl.searchParams.get("workspaceId") });
  if (!parsedParams.success || !parsedQuery.success) return { ok: false, response: NextResponse.json({ error: "Invalid request" }, { status: 400 }) } as const;

  const { agentId } = parsedParams.data;
  const { workspaceId } = parsedQuery.data;
  const forbidden = await requireResourcePermissionAsync(session.user.id, workspaceId, permission, "agent", agentId);
  if (forbidden) return { ok: false, response: forbidden } as const;
  const agent = await getVisibleAgentById(agentId, workspaceId, session.user.id, await canManageTenantGlobals(session, workspaceId));
  if (!agent) return { ok: false, response: NextResponse.json({ error: "Agent not found" }, { status: 404 }) } as const;
  return { ok: true, agent, agentId, workspaceId } as const;
}
