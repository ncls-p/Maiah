import { handleRoute } from "@/lib/route-handler";
import { getAgentVersionById,getAgentVersions } from "@/modules/agent/use-cases";
import { NextRequest,NextResponse } from "next/server";
import { getAuthorizedAgent } from "../agent-route-access";

export async function GET(req: NextRequest, { params }: { params: Promise<{ agentId: string }> }) {
  return handleRoute(
    req,
    async ({ session }) => {
      const { searchParams } = req.nextUrl;
      const access = await getAuthorizedAgent(req, params, session, "agents.get");
      if (!access.ok) return access.response;
      const { agent, agentId } = access;
      const versionId = searchParams.get("versionId");
      if (versionId) {
        const version = await getAgentVersionById(versionId);
        if (!version || version.agentId !== agentId) {
          return NextResponse.json({ error: "Version not found" }, { status: 404 });
        }
        return NextResponse.json({
          ...version,
          isActive: version.id === agent.activeVersionId,
        });
      }
      const versions = await getAgentVersions(agentId);
      const result = versions.map((v) => ({
        ...v,
        isActive: v.id === agent.activeVersionId,
      }));
      return NextResponse.json(result);
    },
    { logLabel: "Failed to list agent versions" },
  );
}
