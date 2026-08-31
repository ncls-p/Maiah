import { logHandledError } from "@/lib/logger";
import { handleRoute } from "@/lib/route-handler";
import {
  isPlatformAdminSession,
  requireAdminApiSession,
} from "@/modules/admin/auth";
import { getSession } from "@/modules/auth/session";
import {
  getRegistrationSetting,
  setRegistrationEnabled,
} from "@/modules/admin/use-cases";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const updateSettingsSchema = z.object({
  registrationEnabled: z.boolean(),
});

export async function GET() {
  try {
    const session = await getSession();
    const setting = await getRegistrationSetting();
    if (await isPlatformAdminSession(session)) {
      return NextResponse.json(setting);
    }
    // Public consumers (the signup page) only need to know whether public
    // registration is open; the user count stays behind the admin session.
    return NextResponse.json({
      registrationEnabled: setting.registrationEnabled,
      canPublicSignUp: setting.canPublicSignUp,
    });
  } catch (error) {
    logHandledError(
      "Failed to read admin settings",
      {},
      error instanceof Error ? error : undefined,
    );
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

      const parsed = updateSettingsSchema.safeParse(await req.json());
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Invalid input", details: parsed.error.issues },
          { status: 400 },
        );
      }

      const setting = await setRegistrationEnabled(
        parsed.data.registrationEnabled,
        session.user.id,
      );
      return NextResponse.json(setting);
    },
    { logLabel: "Failed to update admin settings" },
  );
}
