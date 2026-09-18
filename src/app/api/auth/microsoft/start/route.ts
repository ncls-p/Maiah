import { z } from "zod";
import { checkRateLimit, rateLimitExceededResponse } from "@/lib/rate-limit";
import { readMicrosoftConfig } from "@/modules/auth/microsoft/settings";
import { createMicrosoftAuth } from "@/modules/auth/microsoft/provider";

export async function GET(request: Request) {
  const limit = await checkRateLimit(request, { limit: 20 });
  if (!limit.allowed)
    return rateLimitExceededResponse(limit.reset, limit.remaining, 20);
  const url = new URL(request.url);
  const id = z.uuid().safeParse(url.searchParams.get("organizationId"));
  if (!id.success)
    return Response.json({ error: "Invalid organization" }, { status: 400 });
  const config = await readMicrosoftConfig(id.data);
  if (!config?.enabled || !config.approved)
    return Response.json(
      { error: "Microsoft sign-in unavailable" },
      { status: 404 },
    );
  const locale = url.searchParams.get("locale") === "en" ? "en" : "fr";
  // TLS terminates at the proxy; req.url can carry the internal HTTP origin.
  // Compare the public Host with the configured canonical origin instead.
  if (
    request.headers.get("host")?.toLowerCase() !==
    new URL(config.loginOrigin).host
  ) {
    const canonical = new URL("/api/auth/microsoft/start", config.loginOrigin);
    canonical.searchParams.set("organizationId", id.data);
    canonical.searchParams.set("locale", locale);
    return Response.redirect(canonical, 302);
  }
  const auth = await createMicrosoftAuth(id.data, config);
  const response = await auth.api.signInSocial({
    body: {
      provider: "microsoft",
      callbackURL: `${config.loginOrigin}/${locale}/chat`,
      errorCallbackURL: `${config.loginOrigin}/${locale}/auth/signin?microsoftError=1`,
      additionalData: {
        organizationId: id.data,
        microsoftRevision: config.revision,
      },
    },
    headers: request.headers,
    asResponse: true,
  });
  if (!response.ok) return response;
  const data = (await response.json()) as { url?: string };
  if (!data.url)
    return Response.json({ error: "Unable to start sign-in" }, { status: 502 });
  const headers = new Headers(response.headers);
  headers.delete("content-type");
  headers.set("location", data.url);
  headers.set("cache-control", "no-store");
  return new Response(null, { status: 302, headers });
}
