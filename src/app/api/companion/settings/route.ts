import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleRoute } from "@/lib/route-handler";
import { requireOrganizationSettingsScope } from "@/modules/organization/settings-scope";
import { isPlatformAdminSession } from "@/modules/admin/auth";
import {
  CompanionConfigurationError,
  companionAdminState,
  setCompanionAgent,
  writeSetting,
  GLOBAL_KEY,
} from "@/modules/companion/settings";
export async function GET(req: NextRequest) {
  return handleRoute(
    req,
    async () => {
      const scope = await requireOrganizationSettingsScope(req);
      if (!scope.ok) return scope.response;
      return NextResponse.json({
        ...(await companionAdminState(scope.organizationId)),
        canEnable: await isPlatformAdminSession(scope.session),
      });
    },
    {
      allowApiKey: false,
      expectedError: (error) =>
        error instanceof CompanionConfigurationError
          ? NextResponse.json({ error: error.message }, { status: 400 })
          : null,
    },
  );
}
export async function PATCH(req: NextRequest) {
  return handleRoute(
    req,
    async ({ session }) => {
      const scope = await requireOrganizationSettingsScope(req);
      if (!scope.ok) return scope.response;
      const parsed = z
        .object({
          agentId: z.uuid().nullable().optional(),
          enabled: z.boolean().optional(),
        })
        .strict()
        .safeParse(await req.json());
      if (!parsed.success)
        return NextResponse.json(
          { error: "Invalid settings" },
          { status: 400 },
        );
      if (
        parsed.data.enabled !== undefined &&
        !(await isPlatformAdminSession(session))
      )
        return NextResponse.json(
          { error: "Application administrator required" },
          { status: 403 },
        );
      if (parsed.data.agentId !== undefined)
        await setCompanionAgent(
          scope.organizationId,
          parsed.data.agentId,
          session.user.id,
        );
      if (parsed.data.enabled !== undefined)
        await writeSetting(GLOBAL_KEY, parsed.data.enabled, session.user.id);
      return NextResponse.json({
        ...(await companionAdminState(scope.organizationId)),
        canEnable: await isPlatformAdminSession(session),
      });
    },
    {
      allowApiKey: false,
      expectedError: (error) =>
        error instanceof CompanionConfigurationError
          ? NextResponse.json({ error: error.message }, { status: 400 })
          : null,
    },
  );
}
