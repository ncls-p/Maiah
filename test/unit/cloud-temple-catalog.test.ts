import { describe, expect, it } from "vitest";
import {
  CLOUD_TEMPLE_BASE_URL,
  enrichCloudTempleModel,
  isCloudTempleBaseUrl,
} from "@/modules/provider/cloud-temple-catalog";

const baseCapabilities = {
  text: true,
  vision: false,
  tools: false,
  reasoning: false,
  embeddings: false,
  audio: false,
  imageGeneration: false,
};

describe("Cloud Temple catalogue", () => {
  it("recognizes only the official API host", () => {
    expect(isCloudTempleBaseUrl(CLOUD_TEMPLE_BASE_URL)).toBe(true);
    expect(isCloudTempleBaseUrl("https://example.com/v1")).toBe(false);
    expect(isCloudTempleBaseUrl("not a url")).toBe(false);
  });

  it("marks z-image as an OpenAI-compatible image model", () => {
    const model = enrichCloudTempleModel({
      modelId: "z-image:16b",
      capabilities: baseCapabilities,
    });
    expect(model.capabilities).toMatchObject({
      text: false,
      imageGeneration: true,
    });
    expect(model.imageGeneration).toMatchObject({
      enabled: true,
      isDefault: true,
      defaultSize: "1024x1024",
    });
  });

  it("adds documented token pricing and energy without inventing CO2", () => {
    const model = enrichCloudTempleModel({
      modelId: "gpt-oss:120b",
      capabilities: baseCapabilities,
    });
    expect(model.inputTokenCost).toBe("1.8");
    expect(model.outputTokenCost).toBe("8");
    expect(model.sustainability).toMatchObject({
      energyKwhPerMillionTokens: 2.37,
      currency: "EUR",
    });
    expect(model.sustainability).not.toHaveProperty("co2GramsPerMillionTokens");
  });
});
