import { describe, expect, it } from "vitest";
import { formatModelImpact } from "@/lib/model-impact";

describe("model selection impact", () => {
  it("distinguishes missing, invalid and explicitly zero prices/carbon", () => {
    expect(formatModelImpact({}, "fr")).toEqual({
      input: null,
      output: null,
      carbon: null,
    });
    expect(
      formatModelImpact(
        {
          inputTokenCost: " ",
          outputTokenCost: "NaN",
          sustainabilityConfigJson: { co2GramsPerMillionTokens: -1 },
        },
        "fr",
      ),
    ).toEqual({ input: null, output: null, carbon: null });
    const zero = formatModelImpact(
      {
        inputTokenCost: "0",
        outputTokenCost: "0",
        sustainabilityConfigJson: { co2GramsPerMillionTokens: 0 },
      },
      "fr",
    );
    expect(zero.input).toContain("0");
    expect(zero.output).toContain("EUR");
    expect(zero.carbon).toBe("0");
  });
  it("uses the catalog currency and locale without rounding tiny nonzero values to zero", () => {
    const data = {
      inputTokenCost: "0.000015",
      outputTokenCost: "1.25",
      sustainabilityConfigJson: {
        currency: "USD",
        co2GramsPerMillionTokens: 0.000025,
      },
    };
    expect(formatModelImpact(data, "fr")).toMatchObject({
      input: expect.stringContaining("0,000015"),
      output: expect.stringContaining("USD"),
      carbon: "0,000025",
    });
    expect(formatModelImpact(data, "en").output).toContain("1.25");
    expect(
      formatModelImpact(
        { sustainabilityConfigJson: { currency: "invalid" } },
        "fr",
      ).input,
    ).toBeNull();
  });
});
