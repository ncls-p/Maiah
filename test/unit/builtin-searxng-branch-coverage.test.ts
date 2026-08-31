import {
  base64Tool,
  dateMath,
  jsonTool,
  randomNumbers,
  searchWebWithSearxng,
  slugifyText,
  textStats,
  unitConverter,
} from "@/modules/tool/builtin-tool-primitives.search-web-with-searxng";
import {
  fetchSearxngResults,
} from "@/modules/tool/builtin-tool-primitives.calculate-expression";
import { webSearchInputSchema } from "@/modules/tool/builtin-tool-primitives.calculator-input-schema";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "@/modules/tool/builtin-tool-primitives.calculate-expression",
  async (importOriginal) => {
    const actual = await importOriginal<
      typeof import("@/modules/tool/builtin-tool-primitives.calculate-expression")
    >();
    return { ...actual, fetchSearxngResults: vi.fn() };
  },
);

const mockFetch = vi.mocked(fetchSearxngResults);

const rawResult = {
  title: "Example",
  url: "https://example.com",
  content: "A snippet",
  score: 1.5,
  engines: [],
};

beforeEach(() => {
  mockFetch.mockReset();
});

describe("searxng web search branch coverage", () => {
  it("returns results from the first suffixed query", async () => {
    mockFetch.mockResolvedValueOnce([rawResult]);
    const result = await searchWebWithSearxng(
      webSearchInputSchema.parse({ query: "cats", language: "fr" }),
    );
    expect(result.ok).toBe(true);
    expect(result.resultCount).toBe(1);
    expect(result.error).toBeNull();
    expect(result.searchedQuery).toContain("today");
    expect(result.successfulQuery).toBe(result.searchedQuery);
    expect(result.summary).toContain("Example");
    const url = mockFetch.mock.calls[0][0];
    expect(url.searchParams.get("language")).toBe("fr");
    expect(url.searchParams.get("q")).toBe(result.searchedQuery);
  });

  it("retries with the plain query when the first returns nothing", async () => {
    mockFetch
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([rawResult]);
    const result = await searchWebWithSearxng(
      webSearchInputSchema.parse({ query: "cats" }),
    );
    expect(result.ok).toBe(true);
    expect(result.successfulQuery).toBe("cats");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("reports the last error when every query fails", async () => {
    mockFetch
      .mockRejectedValueOnce(new Error("boom"))
      .mockRejectedValueOnce("string failure");
    const result = await searchWebWithSearxng(
      webSearchInputSchema.parse({ query: "cats" }),
    );
    expect(result.ok).toBe(false);
    expect(result.resultCount).toBe(0);
    expect(result.error).toBe("string failure");
    expect(result.summary).toBe("No web search results were returned.");
  });

  it("applies the result limit", async () => {
    mockFetch.mockResolvedValueOnce([rawResult, rawResult, rawResult]);
    const result = await searchWebWithSearxng(
      webSearchInputSchema.parse({ query: "cats", limit: 2 }),
    );
    expect(result.resultCount).toBe(2);
  });
});

describe("pure primitive tools branch coverage", () => {
  it("generates random numbers and rejects bad ranges", () => {
    expect(() => randomNumbers({ min: 5, max: 5, count: 1, integer: false })).toThrow(
      "max must be greater than min",
    );
    const floats = randomNumbers({ min: 0, max: 1, count: 3, integer: false });
    expect(floats.values).toHaveLength(3);
    expect(floats.value).toBe(floats.values[0]);
    const ints = randomNumbers({ min: 0.5, max: 4.9, count: 5, integer: true });
    for (const value of ints.values) {
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(1);
      expect(value).toBeLessThanOrEqual(4);
    }
    expect(() =>
      randomNumbers({ min: 1.5, max: 1.9, count: 1, integer: true }),
    ).toThrow("No integer exists");
  });

  it("computes date math for every unit and operation", () => {
    expect(() => dateMath({ date: "nope" } as never)).toThrow("Invalid date");
    expect(() =>
      dateMath({ date: "2026-01-01", operation: "difference" } as never),
    ).toThrow("endDate is required");
    const difference = dateMath({
      date: "2026-01-01",
      operation: "difference",
      endDate: "2026-01-11",
    } as never);
    expect(difference.days).toBe(10);
    expect(difference.milliseconds).toBe(10 * 86_400_000);
    expect(
      dateMath({ date: "2026-01-01", operation: "add", amount: 3, unit: "days" } as never)
        .result,
    ).toBe("2026-01-04T00:00:00.000Z");
    expect(
      dateMath({ date: "2026-01-01", operation: "add", amount: 2, unit: "weeks" } as never)
        .result,
    ).toBe("2026-01-15T00:00:00.000Z");
    expect(
      dateMath({ date: "2026-01-15", operation: "add", amount: 1, unit: "months" } as never)
        .result,
    ).toBe("2026-02-15T00:00:00.000Z");
    expect(
      dateMath({ date: "2026-01-01", operation: "add", amount: 1, unit: "years" } as never)
        .result,
    ).toBe("2027-01-01T00:00:00.000Z");
    expect(
      dateMath({ date: "2026-01-10", operation: "subtract", amount: 3, unit: "days" } as never)
        .result,
    ).toBe("2026-01-07T00:00:00.000Z");
  });

  it("validates, minifies, inspects, and pretty-prints json", () => {
    expect(jsonTool({ action: "validate", json: '{"a":1}' })).toEqual({
      valid: true,
    });
    expect(jsonTool({ action: "minify", json: '{ "a": 1 }' })).toEqual({
      result: '{"a":1}',
    });
    expect(jsonTool({ action: "inspect", json: '{"a":1,"b":2}' })).toEqual({
      valid: true,
      type: "object",
      keys: ["a", "b"],
      items: undefined,
    });
    expect(jsonTool({ action: "inspect", json: '[1,2]' })).toEqual({
      valid: true,
      type: "array",
      keys: [],
      items: 2,
    });
    expect(jsonTool({ action: "inspect", json: "42" })).toEqual({
      valid: true,
      type: "number",
      keys: [],
      items: undefined,
    });
    expect(jsonTool({ action: "format", json: '{"a":1}' })).toEqual({
      result: '{\n  "a": 1\n}',
    });
    const invalid = jsonTool({ action: "validate", json: "{nope" });
    expect(invalid.valid).toBe(false);
    expect(invalid.error).toBeTruthy();
  });

  it("computes text stats for empty and populated text", () => {
    expect(textStats({ text: "", wordsPerMinute: 200 })).toEqual({
      characters: 0,
      charactersNoSpaces: 0,
      words: 0,
      lines: 0,
      paragraphs: 0,
      readingTimeMinutes: 1,
    });
    const stats = textStats({
      text: "one two\n\nthree four",
      wordsPerMinute: 100,
    });
    expect(stats.words).toBe(4);
    expect(stats.lines).toBe(3);
    expect(stats.paragraphs).toBe(2);
    expect(stats.readingTimeMinutes).toBe(1);
  });

  it("encodes and decodes base64", () => {
    expect(base64Tool({ action: "encode", value: "hello" })).toEqual({
      result: "aGVsbG8=",
    });
    expect(base64Tool({ action: "decode", value: "aGVsbG8=" })).toEqual({
      result: "hello",
    });
  });

  it("converts units across kinds and rejects mismatches", () => {
    expect(unitConverter({ value: 1, from: "km", to: "m" }).result).toBe(1000);
    expect(unitConverter({ value: 0, from: "c", to: "f" }).result).toBe(32);
    expect(unitConverter({ value: 32, from: "f", to: "c" }).result).toBe(0);
    expect(unitConverter({ value: 273.15, from: "k", to: "c" }).result).toBeCloseTo(0);
    expect(unitConverter({ value: 0, from: "c", to: "k" }).result).toBeCloseTo(273.15);
    expect(unitConverter({ value: 100, from: "c", to: "f" }).result).toBe(212);
    expect(() => unitConverter({ value: 1, from: "km", to: "c" })).toThrow(
      "Cannot convert",
    );
  });

  it("slugifies text with both separators and accents", () => {
    expect(slugifyText({ text: "  Héllo, World!  ", separator: "-" })).toEqual({
      slug: "hello-world",
    });
    expect(slugifyText({ text: "--Hello__World--", separator: "_" })).toEqual({
      slug: "Hello_World".toLowerCase(),
    });
  });
});