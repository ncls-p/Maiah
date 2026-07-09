import { describe, expect, it } from "vitest";
import {
  evaluateQuotaReservation,
  startOfQuotaMonth,
  WorkspaceQuotaReservationError,
} from "@/modules/usage/quota-reservations";

describe("workspace token reservations", () => {
  it("admits a reservation that fits after usage and active holds", () => {
    expect(
      evaluateQuotaReservation({
        limit: 100_000,
        used: 40_000,
        reserved: 10_000,
        requested: 20_000,
      }),
    ).toMatchObject({ allowed: true, requested: 20_000 });
  });

  it("denies overbooking even when settled usage alone is below the limit", () => {
    expect(
      evaluateQuotaReservation({
        limit: 100_000,
        used: 40_000,
        reserved: 50_000,
        requested: 20_000,
      }),
    ).toMatchObject({ allowed: false });
  });

  it("normalizes the UTC accounting period", () => {
    expect(startOfQuotaMonth(new Date("2026-07-19T12:34:56Z"))).toEqual(
      new Date("2026-07-01T00:00:00Z"),
    );
  });

  it("provides a machine-readable quota error", () => {
    const error = new WorkspaceQuotaReservationError(
      40_000,
      50_000,
      20_000,
      100_000,
    );
    expect(error.code).toBe("WORKSPACE_TOKEN_QUOTA_EXCEEDED");
    expect(error.message).toContain("20,000 requested");
  });
});
