import { NextRequest,NextResponse } from "next/server";
import { handleRoute } from "@/lib/route-handler";
import { getAuthorizedGitHubStatus } from "../github-route-status";

export async function GET(req: NextRequest) {
  return handleRoute(req, async ({ session }) => {
    const access = await getAuthorizedGitHubStatus(req, session.user.id);
    if (!access.ok) return access.response;
    return NextResponse.json(access.status);
  });
}
