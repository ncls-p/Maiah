import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleRoute } from "@/lib/route-handler";
import { getCompanionState } from "@/modules/companion/settings";
export async function GET(req: NextRequest) {
  return handleRoute(
    req,
    async ({ session }) => {
      const workspace = z
        .uuid()
        .safeParse(req.nextUrl.searchParams.get("workspaceId"));
      if (!workspace.success)
        return NextResponse.json({ error: "Invalid project" }, { status: 400 });
      const state = await getCompanionState(session.user.id, workspace.data);
      return state
        ? NextResponse.json(state)
        : NextResponse.json({ error: "Forbidden" }, { status: 403 });
    },
    { allowApiKey: false },
  );
}
