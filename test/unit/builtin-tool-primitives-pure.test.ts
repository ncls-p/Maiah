import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	base64Tool,
	calculateExpression,
	colorConverter,
	dateMath,
	jsonTool,
	markdownTable,
	randomNumbers,
	searchWebWithSearxng,
	slugifyText,
	textStats,
	unitConverter,
} from "@/modules/tool/builtin-tool-primitives";

describe("calculateExpression", () => {
	it("evaluates arithmetic, precedence, unary operators, exponents, and functions", () => {
		expect(calculateExpression("1 + 2 * 3")).toBe(7);
		expect(calculateExpression("2^3^2")).toBe(512);
		expect(
			calculateExpression("sqrt(9) + abs(-4) + floor(1.9) + ceil(1.1)"),
		).toBe(10);
		expect(calculateExpression("round(cos(0)) + +5 - -2")).toBe(8);
	});

	it("rejects invalid expressions", () => {
		expect(() => calculateExpression("foo")).toThrow("Unknown identifier");
		expect(() => calculateExpression("(1 + 2")).toThrow(
			"Missing closing parenthesis",
		);
		expect(() => calculateExpression("1 / 0")).toThrow("finite number");
		expect(() => calculateExpression("unknown(1)")).toThrow("Unknown function");
	});
});

describe("web search primitive", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it("normalizes successful SearXNG results and retries with the original query", async () => {
		const fetchMock = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ results: [] }),
			} as Response)
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					results: [
						{
							title: "Result",
							url: "https://example.test",
							content: "Snippet",
							score: 0.9,
							engine: "demo",
						},
						{ title: "Ignored missing URL" },
					],
				}),
			} as Response);

		const result = await searchWebWithSearxng({
			query: "latest AI news",
			limit: 3,
			language: "en",
		});

		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(result.ok).toBe(true);
		expect(result.resultCount).toBe(1);
		expect(result.successfulQuery).toBe("latest AI news");
		expect(result.summary).toContain("Result");
		expect(result.results[0]).toMatchObject({ engines: ["demo"], score: 0.9 });
	});

	it("returns an error summary when search requests fail", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue({
			ok: false,
			status: 503,
			statusText: "Unavailable",
		} as Response);

		const result = await searchWebWithSearxng({ query: "offline", limit: 1 });

		expect(result.ok).toBe(false);
		expect(result.error).toContain("503 Unavailable");
		expect(result.summary).toBe("No web search results were returned.");
	});
});

describe("utility primitives", () => {
	it("generates random numbers and validates ranges", () => {
		const decimals = randomNumbers({
			min: 1,
			max: 2,
			count: 2,
			integer: false,
		});
		expect(decimals.values).toHaveLength(2);
		expect(decimals.values[0]).toBeGreaterThanOrEqual(1);
		expect(decimals.values[0]).toBeLessThan(2);

		const integers = randomNumbers({
			min: 1.2,
			max: 3.8,
			count: 3,
			integer: true,
		});
		expect(integers.values.every(Number.isInteger)).toBe(true);
		expect(() =>
			randomNumbers({ min: 5, max: 5, count: 1, integer: false }),
		).toThrow("max must be greater");
		expect(() =>
			randomNumbers({ min: 1.1, max: 1.2, count: 1, integer: true }),
		).toThrow("No integer exists");
	});

	it("does date math for add, subtract, and difference", () => {
		expect(
			dateMath({
				date: "2025-01-01T00:00:00Z",
				operation: "add",
				amount: 2,
				unit: "weeks",
			}).result,
		).toBe("2025-01-15T00:00:00.000Z");
		expect(
			dateMath({
				date: "2025-03-01T00:00:00Z",
				operation: "subtract",
				amount: 1,
				unit: "months",
			}).result,
		).toBe("2025-02-01T00:00:00.000Z");
		expect(
			dateMath({
				date: "2025-01-01T00:00:00Z",
				operation: "difference",
				endDate: "2025-01-03T00:00:00Z",
				amount: 0,
				unit: "days",
			}),
		).toMatchObject({ days: 2 });
		expect(() =>
			dateMath({ date: "bad", operation: "add", amount: 1, unit: "days" }),
		).toThrow("Invalid date");
		expect(() =>
			dateMath({
				date: "2025-01-01",
				operation: "difference",
				amount: 0,
				unit: "days",
			}),
		).toThrow("endDate is required");
	});

	it("formats JSON, stats, base64, units, slugs, colors, and tables", () => {
		expect(jsonTool({ action: "validate", json: '{"a":1}' })).toEqual({
			valid: true,
		});
		expect(jsonTool({ action: "minify", json: '{ "a" : 1 }' })).toEqual({
			result: '{"a":1}',
		});
		expect(jsonTool({ action: "inspect", json: "[1,2]" })).toMatchObject({
			valid: true,
			type: "array",
			items: 2,
		});
		expect(jsonTool({ action: "format", json: "bad" }).valid).toBe(false);

		expect(
			textStats({ text: "Hello world\n\nAgain", wordsPerMinute: 200 }),
		).toMatchObject({
			words: 3,
			lines: 3,
			paragraphs: 2,
			readingTimeMinutes: 1,
		});
		expect(
			base64Tool({
				action: "decode",
				value: base64Tool({ action: "encode", value: "héllo" }).result,
			}),
		).toEqual({ result: "héllo" });
		expect(unitConverter({ value: 0, from: "c", to: "f" }).result).toBe(32);
		expect(unitConverter({ value: 1, from: "km", to: "m" }).result).toBe(1000);
		expect(() => unitConverter({ value: 1, from: "km", to: "kg" })).toThrow(
			"Cannot convert",
		);
		expect(
			slugifyText({ text: " À bientôt, AI Hub! ", separator: "-" }),
		).toEqual({ slug: "a-bientot-ai-hub" });
		expect(colorConverter({ hex: "#336699" })).toEqual({
			hex: "#336699",
			rgb: { r: 51, g: 102, b: 153 },
			hsl: { h: 210, s: 50, l: 40 },
		});
		expect(
			markdownTable({ columns: ["A|B", "C"], rows: [["x\ny", "z|q"]] })
				.markdown,
		).toContain("A\\|B");
	});
});
