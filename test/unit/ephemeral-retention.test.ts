import { describe, expect, it } from "vitest";

import {
  DEFAULT_EPHEMERAL_TTL_MINUTES,
  EPHEMERAL_TTL_OPTIONS,
  ephemeralExpiresAt,
  isEphemeralTtlMinutes,
} from "@/modules/chat/ephemeral-retention";

describe("temporary chat retention", () => {
  it("offers the supported inactivity periods with 24 hours by default", () => {
    expect(EPHEMERAL_TTL_OPTIONS).toEqual([5, 720, 1_440, 2_880, 10_080]);
    expect(DEFAULT_EPHEMERAL_TTL_MINUTES).toBe(1_440);
    expect(isEphemeralTtlMinutes(5)).toBe(true);
    expect(isEphemeralTtlMinutes(30)).toBe(false);
  });

  it("computes expiration from the latest activity time", () => {
    const lastActivity = new Date("2026-08-10T10:00:00.000Z");
    expect(ephemeralExpiresAt(720, lastActivity).toISOString()).toBe(
      "2026-08-10T22:00:00.000Z",
    );
  });
});
