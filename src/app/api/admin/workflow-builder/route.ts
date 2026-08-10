import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { handleRoute } from "@/lib/route-handler";
import { requireAdminApiSession } from "@/modules/admin/auth";
import {
  getWorkflowBuilderAdminState,
  setWorkflowBuilderConfig,
} from "@/modules/workflows/builder-settings";

const querySchema = z.object({
  workspaceId: z.uuid(),
});

const updateSchema = z.object({
  workspaceId: z.uuid(),
  agentId: z.uuid().nullable(),
});

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdminApiSession();
    if (!auth.ok) return auth.response;

    const parsed = querySchema.safeParse({
      workspaceId: req.nextUrl.searchParams.get("workspaceId"),
    });
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    return NextResponse.json(
      await getWorkflowBuilderAdminState(parsed.data.workspaceId),
    );
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest) {
  return handleRoute(
    req,
    async ({ session }) => {
      const auth = await requireAdminApiSession();
      if (!auth.ok) return auth.response;

      const parsed = updateSchema.safeParse(await req.json());
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Invalid input", details: parsed.error.issues },
          { status: 400 },
        );
      }

      return NextResponse.json(
        await setWorkflowBuilderConfig({
          ...parsed.data,
          updatedById: session.user.id,
        }),
      );
    },
    { logLabel: "Failed to update workflow builder config" },
  );
}
