import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { handleRoute } from "@/lib/route-handler";
import { requireOrganizationSettingsScope } from "@/modules/organization/settings-scope";
import {
  getWorkflowBuilderAdminState,
  setWorkflowBuilderConfig,
} from "@/modules/workflows/builder-settings";

const updateSchema = z.object({
  agentId: z.uuid().nullable(),
});

export async function GET(req: NextRequest) {
  try {
    const auth = await requireOrganizationSettingsScope(req);
    if (!auth.ok) return auth.response;

    return NextResponse.json(
      await getWorkflowBuilderAdminState(auth.organizationId),
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
      const auth = await requireOrganizationSettingsScope(req);
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
          organizationId: auth.organizationId,
          updatedById: session.user.id,
        }),
      );
    },
    {
      allowApiKey: false,
      logLabel: "Failed to update workflow builder config",
    },
  );
}
