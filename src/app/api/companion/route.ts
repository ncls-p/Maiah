import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleRoute } from "@/lib/route-handler";
import {
  getCompanionState,
  getUserCompanionEnabled,
  setUserCompanionEnabled,
} from "@/modules/companion/settings";

export async function GET(req: NextRequest) {
  return handleRoute(
    req,
    async ({ session }) => {
      const workspaceId = req.nextUrl.searchParams.get("workspaceId");
      if (!workspaceId) {
        return NextResponse.json({
          userEnabled: await getUserCompanionEnabled(session.user.id),
        });
      }
      const workspace = z.uuid().safeParse(workspaceId);
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

export async function PATCH(req: NextRequest) {
  return handleRoute(
    req,
    async ({ session }) => {
      const parsed = z
        .object({ userEnabled: z.boolean() })
        .strict()
        .safeParse(await req.json());
      if (!parsed.success)
        return NextResponse.json(
          { error: "Invalid settings" },
          { status: 400 },
        );
      await setUserCompanionEnabled(session.user.id, parsed.data.userEnabled);
      return NextResponse.json({ userEnabled: parsed.data.userEnabled });
    },
    { allowApiKey: false },
  );
}
