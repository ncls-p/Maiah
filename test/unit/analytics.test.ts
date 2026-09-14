import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { analyticsQuerySchema } from "@/modules/analytics/query";
import {
  combineMetricRows,
  type MetricRow,
} from "@/modules/analytics/usage-metrics";
import { csvCell } from "@/modules/analytics/export";
describe("analytics query and reporting invariants", () => {
  it("rejects missing scope IDs, inverted dates, malformed IDs and unbounded pages", () => {
    for (const input of [
      { scope: "organization" },
      {
        scope: "application",
        from: "2026-09-12T00:00:00Z",
        to: "2026-09-11T00:00:00Z",
      },
      { scope: "application", modelIds: "fake" },
      { scope: "application", limit: 10001 },
      { scope: "application", offset: -1 },
    ])
      expect(analyticsQuerySchema.safeParse(input).success).toBe(false);
    expect(
      analyticsQuerySchema.safeParse({
        scope: "application",
        from: "2026-09-14T12:00:00Z",
        to: "2026-09-14T12:00:00.001Z",
      }).success,
    ).toBe(true);
    expect(analyticsQuerySchema.parse({ scope: "application" })).toMatchObject({
      limit: 50,
      offset: 0,
      groupBy: "provider",
      bucket: "day",
    });
  });
  it("weights latency by measured rows and does not mix currencies", () => {
    const base: MetricRow = {
      id: "p",
      name: "Provider",
      date: "2026-09-01",
      currency: "EUR",
      events: 2,
      inputTokens: 10,
      outputTokens: 3,
      failedEvents: 1,
      latencySum: 100,
      latencyCount: 1,
      unpricedEvents: 1,
      amount: 0.2,
    };
    const [result] = combineMetricRows([
      base,
      {
        ...base,
        currency: "USD",
        events: 10,
        latencySum: 900,
        latencyCount: 3,
      },
    ]);
    expect(result.events).toBe(12);
    expect(result.averageLatencyMs).toBe(250);
    expect(result.costs).toEqual([
      { currency: "EUR", amount: 0.2 },
      { currency: "USD", amount: 0.2 },
    ]);
    expect(
      combineMetricRows([
        { ...base, id: null, name: null, latencyCount: 0 },
      ])[0],
    ).toMatchObject({ id: "unknown", name: "", averageLatencyMs: 0 });
  });
  it("escapes CSV quotes, newlines and spreadsheet formulas", () => {
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
    expect(csvCell(" =HYPERLINK(1)")).toBe('"\' =HYPERLINK(1)"');
    expect(csvCell(null)).toBe('""');
    expect(csvCell({ value: 1 })).toBe('"{""value"":1}"');
  });
});
