import { auth } from "@/lib/auth";
import {
  ensureBootstrapAdmin,
  getRegistrationSetting,
} from "@/modules/admin/use-cases";
import { toNextJsHandler } from "better-auth/next-js";

const authHandlers = toNextJsHandler(auth.handler);

export async function GET(req: Request) {
  if (new URL(req.url).pathname === "/api/auth/callback/microsoft") {
    const { microsoftCallback } = await import("@/modules/auth/microsoft/flow");
    return microsoftCallback(req);
  }
  return authHandlers.GET(req);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ all: string[] }> },
) {
  const route = (await params).all.join("/");

  if (route === "callback/microsoft") {
    return Response.json(
      { error: "Use the Microsoft query callback" },
      { status: 405 },
    );
  }

  if (route === "sign-up/email") {
    const settings = await getRegistrationSetting();
    if (!settings.canPublicSignUp) {
      return Response.json(
        {
          message:
            "Registration is closed. Ask an admin to create your account.",
        },
        { status: 403 },
      );
    }
  }

  const response = await authHandlers.POST(req);

  if (route === "sign-up/email" && response.ok) {
    await ensureBootstrapAdmin();
  }

  return response;
}
