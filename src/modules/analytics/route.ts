import { EXPORT_LIMIT, exportAnalyticsCsv } from "./export";
import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/lib/route-handler";
import { analyticsQuerySchema, type AnalyticsKind } from "./query";
import { authorizeAnalytics } from "./scope";
import { getUsageAnalytics } from "./usage";
import { getAuditAnalytics } from "./audit";

export function handleAnalytics(req: NextRequest, kind: AnalyticsKind) {
  return handleRoute(req, async ({ session }) => {
    const parsed = analyticsQuerySchema.safeParse(
      Object.fromEntries(req.nextUrl.searchParams),
    );
    if (!parsed.success)
      return NextResponse.json(
        { error: "Invalid filters", details: parsed.error.issues },
        { status: 400 },
      );
    const scope = await authorizeAnalytics(session, kind, parsed.data);
    if (!scope)
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const exporting = req.nextUrl.searchParams.get("format") === "csv";
    if (exporting && !scope.canExport)
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const query = exporting
      ? { ...parsed.data, offset: 0, limit: EXPORT_LIMIT }
      : parsed.data;
    const data =
      kind === "usage"
        ? await getUsageAnalytics(query)
        : await getAuditAnalytics(query);
    if (exporting) return exportAnalyticsCsv(data, kind);
    return NextResponse.json(
      { ...data, scope },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  });
}
