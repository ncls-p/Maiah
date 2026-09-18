import { z } from "zod";
import { checkRateLimit, rateLimitExceededResponse } from "@/lib/rate-limit";
import { resolveMicrosoftOrganization } from "@/modules/auth/microsoft/settings";

export async function POST(request: Request) {
  const limit = await checkRateLimit(request, { limit: 20 });
  if (!limit.allowed)
    return rateLimitExceededResponse(limit.reset, limit.remaining, 20);
  const input = z
    .object({ email: z.email(), locale: z.enum(["fr", "en"]).default("fr") })
    .safeParse(await request.json().catch(() => null));
  if (!input.success)
    return Response.json({ error: "Invalid email" }, { status: 400 });
  // Domain discovery only: never disclose whether a particular user has an account.
  const match = await resolveMicrosoftOrganization(input.data.email);
  if (!match)
    return Response.json(
      { error: "Microsoft sign-in unavailable for this email domain" },
      { status: 404 },
    );
  const url = new URL("/api/auth/microsoft/start", match.config.loginOrigin);
  url.searchParams.set("organizationId", match.organizationId);
  url.searchParams.set("locale", input.data.locale);
  return Response.json(
    { url: url.toString() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
