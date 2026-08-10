import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const chain = {
    select: vi.fn(),
    from: vi.fn(),
    where: vi.fn(),
  };
  chain.select.mockReturnValue(chain);
  chain.from.mockReturnValue(chain);
  return { chain };
});

vi.mock("@/server/infrastructure/db", () => ({ db: mocks.chain }));

import { calculateOrchestrationUsageImpact } from "@/modules/agent/orchestration-usage-impact";

describe("calculateOrchestrationUsageImpact", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.chain.select.mockReturnValue(mocks.chain);
    mocks.chain.from.mockReturnValue(mocks.chain);
  });

  it("sums root and specialist impact with each model's own pricing", async () => {
    mocks.chain.where.mockResolvedValueOnce([
      {
        id: "root-model",
        inputTokenCost: "2",
        outputTokenCost: "4",
        sustainabilityConfigJson: {
          currency: "EUR",
          energyKwhPerMillionTokens: 1,
        },
      },
      {
        id: "specialist-model",
        inputTokenCost: "10",
        outputTokenCost: "20",
        sustainabilityConfigJson: {
          currency: "EUR",
          energyKwhPerMillionTokens: 3,
        },
      },
    ]);

    const impact = await calculateOrchestrationUsageImpact(
      [
        { modelId: "root-model", inputTokens: 1_000, outputTokens: 500 },
        {
          modelId: "specialist-model",
          inputTokens: 2_000,
          outputTokens: 1_000,
        },
      ],
      100,
    );

    expect(impact.inputTokens).toBe(3_000);
    expect(impact.outputTokens).toBe(1_500);
    expect(impact.cost).toBeCloseTo(0.044);
    expect(impact.energyKwh).toBeCloseTo(0.0105);
    expect(impact.co2Grams).toBeCloseTo(1.05);
  });

  it("does not display a misleading partial price across currencies", async () => {
    mocks.chain.where.mockResolvedValueOnce([
      {
        id: "eur-model",
        inputTokenCost: "2",
        outputTokenCost: "4",
        sustainabilityConfigJson: { currency: "EUR" },
      },
      {
        id: "usd-model",
        inputTokenCost: "2",
        outputTokenCost: "4",
        sustainabilityConfigJson: { currency: "USD" },
      },
    ]);

    const impact = await calculateOrchestrationUsageImpact([
      { modelId: "eur-model", inputTokens: 100, outputTokens: 50 },
      { modelId: "usd-model", inputTokens: 100, outputTokens: 50 },
    ]);

    expect(impact.cost).toBeNull();
    expect(impact.inputTokens).toBe(200);
    expect(impact.outputTokens).toBe(100);
  });
});
