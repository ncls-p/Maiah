import { calculateImageUsageImpact,calculateTokenUsageImpact,parseImageGenerationConfig } from "@/modules/provider/model-runtime-config";
import { describe,expect,it } from "vitest";

describe("model runtime configuration", () => {
  it("calculates price, energy and carbon impact from token usage", () => {
    expect(
      calculateTokenUsageImpact({
        inputTokens: 500_000,
        outputTokens: 250_000,
        inputCostPerMillion: "1.8",
        outputCostPerMillion: "8",
        sustainability: {
          energyKwhPerMillionTokens: 2,
          co2GramsPerMillionTokens: 100,
          currency: "EUR",
        },
      }),
    ).toEqual({
      inputTokens: 500_000,
      outputTokens: 250_000,
      cost: 2.9,
      currency: "EUR",
      energyKwh: 1.5,
      co2Grams: 75,
    });
  });

  it("keeps unavailable metrics explicit instead of inventing zeroes", () => {
    expect(
      calculateTokenUsageImpact({
        inputTokens: 10,
        outputTokens: 20,
      }),
    ).toMatchObject({
      cost: null,
      energyKwh: null,
      co2Grams: null,
    });
  });

  it("estimates carbon only when an admin configures carbon intensity", () => {
    expect(
      calculateTokenUsageImpact({
        inputTokens: 500_000,
        outputTokens: 500_000,
        sustainability: {
          energyKwhPerMillionTokens: 2,
          currency: "EUR",
        },
        co2GramsPerKwh: 50,
      }),
    ).toMatchObject({
      energyKwh: 2,
      co2Grams: 100,
    });
    expect(
      calculateImageUsageImpact(
        {
          enabled: true,
          energyKwhPerImage: 0.25,
          currency: "EUR",
        },
        40,
      ),
    ).toMatchObject({
      energyKwh: 0.25,
      co2Grams: 10,
    });
  });

  it("uses safe image defaults and configurable per-image impact", () => {
    expect(parseImageGenerationConfig({})).toMatchObject({
      enabled: false,
      isDefault: false,
      defaultSize: "1024x1024",
      allowedSizes: ["1024x1024"],
      currency: "EUR",
    });
    expect(
      calculateImageUsageImpact({
        enabled: true,
        costPerImage: 0.08,
        energyKwhPerImage: 0.02,
        co2GramsPerImage: 1.5,
        currency: "EUR",
      }),
    ).toEqual({
      cost: 0.08,
      currency: "EUR",
      energyKwh: 0.02,
      co2Grams: 1.5,
    });
  });
});
