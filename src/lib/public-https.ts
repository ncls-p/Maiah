import type { NextRequest } from "next/server";

function firstForwardedValue(value: string | null) {
  return value?.split(",")[0]?.trim() || null;
}

export function getConfiguredHttpsRedirect(
  request: NextRequest,
  configuredBaseUrl = process.env.BETTER_AUTH_URL,
) {
  if (!configuredBaseUrl) return null;

  let publicUrl: URL;
  try {
    publicUrl = new URL(configuredBaseUrl);
  } catch {
    return null;
  }
  if (publicUrl.protocol !== "https:") return null;

  const requestHost =
    firstForwardedValue(request.headers.get("x-forwarded-host")) ??
    firstForwardedValue(request.headers.get("host")) ??
    request.nextUrl.host;
  const requestProtocol =
    firstForwardedValue(request.headers.get("x-forwarded-proto")) ??
    request.nextUrl.protocol.replace(":", "");

  if (requestHost !== publicUrl.host || requestProtocol === "https") {
    return null;
  }

  const redirectUrl = request.nextUrl.clone();
  redirectUrl.protocol = publicUrl.protocol;
  redirectUrl.hostname = publicUrl.hostname;
  redirectUrl.port = publicUrl.port;
  return redirectUrl;
}
