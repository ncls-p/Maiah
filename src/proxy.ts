import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { getConfiguredHttpsRedirect } from "@/lib/public-https";
import { routing } from "./i18n/routing";

const intlMiddleware = createMiddleware(routing);

export default function proxy(request: NextRequest) {
  const httpsRedirect = getConfiguredHttpsRedirect(request);
  if (httpsRedirect) {
    return NextResponse.redirect(httpsRedirect, 308);
  }
  return intlMiddleware(request);
}

export const config = {
  matcher: ["/((?!api|v1|_next|_vercel|.*\\..*).*)"],
};
