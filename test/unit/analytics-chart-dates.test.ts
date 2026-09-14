import { describe, expect, it } from "vitest";
import { chartDates } from "@/modules/analytics/chart-dates";
describe("analytics time axis", () => {
  it("keeps empty days and query boundaries instead of squeezing gaps", () => {
    expect(
      chartDates(["2026-09-02", "2026-09-04"], {
        from: "2026-09-01T00:00:00Z",
        to: "2026-09-05T12:00:00Z",
        bucket: "day",
      }),
    ).toEqual([
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
      "2026-09-04",
      "2026-09-05",
    ]);
  });
  it("uses UTC Mondays and calendar months across daylight-saving changes", () => {
    expect(
      chartDates(["2026-10-26"], {
        from: "2026-10-24T00:00:00Z",
        to: "2026-11-02T00:00:00Z",
        bucket: "week",
      }),
    ).toEqual(["2026-10-19", "2026-10-26", "2026-11-02"]);
    expect(
      chartDates(["2026-01-01", "2026-03-01"], {
        from: null,
        to: null,
        bucket: "month",
      }),
    ).toEqual(["2026-01-01", "2026-02-01", "2026-03-01"]);
  });
  it("handles empty datasets and bounds expansion of exceptionally long histories", () => {
    expect(chartDates([], { from: null, to: null, bucket: "day" })).toEqual([]);
    expect(
      chartDates(["2026-01-01"], {
        from: "1900-01-01",
        to: "2026-01-01",
        bucket: "day",
      }),
    ).toEqual(["2026-01-01"]);
  });
});
