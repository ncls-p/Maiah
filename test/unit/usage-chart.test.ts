import { describe, expect, it } from "vitest";

import { usageBarHeight } from "@/app/[locale]/(workspace)/usage/usage-trend";

describe("usage chart sizing", () => {
  it("uses concrete pixel heights for non-zero activity", () => {
    expect(usageBarHeight(50, 100)).toBe(96);
    expect(usageBarHeight(1, 100_000)).toBe(4);
  });

  it("does not render a bar for an empty series", () => {
    expect(usageBarHeight(0, 100)).toBe(0);
    expect(usageBarHeight(10, 0)).toBe(0);
  });
});
