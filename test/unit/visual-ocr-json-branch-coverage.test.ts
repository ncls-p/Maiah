import { parseVisualRegionsJson } from "@/modules/document-extraction/visual-ocr-json";
import { describe, expect, it } from "vitest";

describe("visual ocr json branch coverage", () => {
  it("accepts strictly valid region payloads", () => {
    const payload = {
      regions: [
        {
          kind: "text",
          text: "hello",
          description: "greeting",
          confidence: 0.9,
        },
      ],
    };
    const result = parseVisualRegionsJson(JSON.stringify(payload));
    expect(result.regions).toEqual(payload.regions);
    expect(result.regionKeys).toEqual([]);
  });

  it("strips markdown fences and surrounding prose", () => {
    const inner = {
      regions: [
        {
          kind: "table",
          text: "t",
          description: "d",
          confidence: 0.5,
        },
      ],
    };
    const result = parseVisualRegionsJson(
      "Here is the result:\n```json\n" + JSON.stringify(inner) + "\n```\nDone.",
    );
    expect(result.regions).toEqual(inner.regions);
  });

  it("parses braceless json payloads as empty region lists", () => {
    const result = parseVisualRegionsJson("[1,2,3]");
    expect(result.regions).toEqual([]);
    expect(result.regionKeys).toEqual([]);
  });

  it("normalizes loose region objects from alternate keys", () => {
    const payload = {
      regions: [
        { type: "bar chart", content: "chart text", score: 95 },
        { category: "image capture", extracted_text: "a photo", probability: 0.4, caption: "pic" },
        { kind: "TABLE", value: "v", description: "d" },
        { extractedText: "e", summary: "s" },
      ],
    };
    const result = parseVisualRegionsJson(JSON.stringify(payload));
    expect(result.regions).toEqual([
      { kind: "diagram", text: "chart text", description: "", confidence: 0.95 },
      { kind: "image-description", text: "a photo", description: "pic", confidence: 0.4 },
      { kind: "table", text: "v", description: "d", confidence: 0.8 },
      { kind: "text", text: "e", description: "s", confidence: 0.8 },
    ]);
    expect(result.regionKeys).toEqual(
      expect.arrayContaining(["caption", "category", "content", "kind", "score"]),
    );
  });

  it("treats non-string kinds as text and out-of-range confidence as null", () => {
    const payload = {
      regions: [
        { kind: 42, text: "t", description: "d", confidence: "high" },
        { kind: "figure", text: "t", description: "d", confidence: 80 },
      ],
    };
    const result = parseVisualRegionsJson(JSON.stringify(payload));
    expect(result.regions[0].kind).toBe("text");
    expect(result.regions[0].confidence).toBe(0.8);
    expect(result.regions[1].kind).toBe("image-description");
    expect(result.regions[1].confidence).toBe(0.8);
  });

  it("rejects region lists containing non-object entries", () => {
    expect(() =>
      parseVisualRegionsJson('{"regions": ["oops"]}'),
    ).toThrow();
  });
});