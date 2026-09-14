import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/lib/route-handler";
import { listAnalyticsScopes } from "@/modules/analytics/scope";
export function GET(req: NextRequest) {
  return handleRoute(req, async ({ session }) => {
    const kind = req.nextUrl.searchParams.get("kind");
    if (kind !== "usage" && kind !== "audit")
      return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
    return NextResponse.json(
      { scopes: await listAnalyticsScopes(session, kind) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  });
}
