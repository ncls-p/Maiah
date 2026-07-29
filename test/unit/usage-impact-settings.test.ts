import { beforeEach, describe, expect, it, vi } from "vitest";

type Chain = {
  from: ReturnType<typeof vi.fn>;
  where: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  values: ReturnType<typeof vi.fn>;
  onConflictDoUpdate: ReturnType<typeof vi.fn>;
};

const { chain } = vi.hoisted(() => ({
  chain: {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
    values: vi.fn().mockReturnThis(),
    onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
  } as Chain,
}));

vi.mock("@/server/infrastructure/db", () => ({
  db: {
    select: vi.fn(() => chain),
    insert: vi.fn(() => chain),
  },
}));

import {
  getUsageImpactSetting,
  setUsageImpactSetting,
  usageImpactSettingSchema,
} from "@/modules/provider/usage-impact-settings";

beforeEach(() => {
  vi.clearAllMocks();
  chain.from.mockReturnThis();
  chain.where.mockReturnThis();
  chain.limit.mockResolvedValue([]);
  chain.values.mockReturnThis();
  chain.onConflictDoUpdate.mockResolvedValue(undefined);
});

describe("global usage impact settings", () => {
  it("is disabled by default and validates carbon intensity", async () => {
    await expect(getUsageImpactSetting()).resolves.toEqual({ enabled: false });
    expect(
      usageImpactSettingSchema.safeParse({
        enabled: true,
        co2GramsPerKwh: -1,
      }).success,
    ).toBe(false);
  });

  it("persists the global setting", async () => {
    await expect(
      setUsageImpactSetting(
        { enabled: true, co2GramsPerKwh: 42 },
        "11111111-1111-4111-8111-111111111111",
      ),
    ).resolves.toEqual({ enabled: true, co2GramsPerKwh: 42 });
    expect(chain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "usage-impact",
        valueJson: { enabled: true, co2GramsPerKwh: 42 },
      }),
    );
    expect(chain.onConflictDoUpdate).toHaveBeenCalled();
  });
});
