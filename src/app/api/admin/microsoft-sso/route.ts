import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/lib/route-handler";
import { requireOrganizationSettingsScope } from "@/modules/organization/settings-scope";
import { isPlatformAdminUser } from "@/server/infrastructure/db/platform-admin";
import { microsoftUpdateSchema } from "@/modules/auth/microsoft/config";
import {
  microsoftConfigView,
  readMicrosoftConfig,
  saveMicrosoftConfig,
} from "@/modules/auth/microsoft/settings";

export async function GET(req: NextRequest) {
  return handleRoute(
    req,
    async () => {
      const scope = await requireOrganizationSettingsScope(req);
      if (!scope.ok) return scope.response;
      return NextResponse.json(
        {
          config: microsoftConfigView(
            await readMicrosoftConfig(scope.organizationId),
          ),
          canApprove: await isPlatformAdminUser(scope.session.user.id),
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    },
    { allowApiKey: false },
  );
}

export async function PATCH(req: NextRequest) {
  return handleRoute(
    req,
    async () => {
      const scope = await requireOrganizationSettingsScope(req);
      if (!scope.ok) return scope.response;
      // This endpoint accepts a secret: require same-origin JSON writes.
      if (
        req.headers.get("origin") !== new URL(req.url).origin ||
        !req.headers.get("content-type")?.startsWith("application/json")
      )
        return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
      const parsed = microsoftUpdateSchema.safeParse(await req.json());
      if (!parsed.success)
        return NextResponse.json(
          { error: "Invalid Microsoft configuration" },
          { status: 400 },
        );
      const canApprove = await isPlatformAdminUser(scope.session.user.id);
      try {
        return NextResponse.json({
          config: await saveMicrosoftConfig(
            scope.organizationId,
            scope.session.user.id,
            parsed.data,
            canApprove,
          ),
          canApprove,
        });
      } catch (error) {
        // Only controlled configuration validation messages; never return provider errors/secrets.
        const message = error instanceof Error ? error.message : "";
        const safe = [
          "Login origin must be explicitly configured in BETTER_AUTH_TRUSTED_ORIGINS",
          "A client secret is required for this registration",
          "An email domain is already assigned to another organization",
        ];
        if (!safe.includes(message)) throw error;
        return NextResponse.json({ error: message }, { status: 400 });
      }
    },
    { allowApiKey: false },
  );
}
