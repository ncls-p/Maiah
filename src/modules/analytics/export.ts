import { NextResponse } from "next/server";
import type { getUsageAnalytics } from "./usage";
import type { getAuditAnalytics } from "./audit";
export const EXPORT_LIMIT = 10000;
export function csvCell(value: unknown) {
  const text =
    value == null
      ? ""
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value);
  // Spreadsheet formula injection protection, including leading whitespace.
  const safe = /^\s*[=+@-]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}
export function exportAnalyticsCsv(
  data:
    | Awaited<ReturnType<typeof getUsageAnalytics>>
    | Awaited<ReturnType<typeof getAuditAnalytics>>,
  kind: "usage" | "audit",
) {
  const total =
    "events" in data.totals ? data.totals.events : data.totals.total;
  if (total > EXPORT_LIMIT)
    return NextResponse.json(
      { error: "Export exceeds 10000 events. Narrow the period or filters." },
      { status: 413 },
    );
  const rows = data.events.map((event) => ({
    ...event,
    createdAt: event.createdAt.toISOString(),
  }));
  const keys = rows.length ? Object.keys(rows[0]) : ["id", "createdAt"];
  const csv = [
    keys.map(csvCell).join(","),
    ...rows.map((row) =>
      keys
        .map((key) => csvCell((row as Record<string, unknown>)[key]))
        .join(","),
    ),
  ].join("\r\n");
  return new NextResponse(`\ufeff${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${kind}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
