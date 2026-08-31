import {
  calculateExpression,
  fetchSearxngResults,
  normalizeSearxngResults,
  summarizeSearchResults,
} from "@/modules/tool/builtin-tool-primitives.calculate-expression";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("calculate expression branch coverage", () => {
  it("evaluates every supported function", () => {
    expect(calculateExpression("sin(0)")).toBe(0);
    expect(calculateExpression("cos(0)")).toBe(1);
    expect(calculateExpression("tan(0)")).toBe(0);
    expect(calculateExpression("sqrt(4)")).toBe(2);
    expect(calculateExpression("log(1)")).toBe(0);
    expect(calculateExpression("abs(-2)")).toBe(2);
    expect(calculateExpression("round(2.4)")).toBe(2);
    expect(calculateExpression("floor(2.9)")).toBe(2);
    expect(calculateExpression("ceil(2.1)")).toBe(3);
  });

  it("rejects trailing tokens, missing parens, and empty input", () => {
    expect(() => calculateExpression("1+2)")).toThrow(
      "Unexpected token after expression",
    );
    expect(() => calculateExpression("sin1")).toThrow(
      "Unknown identifier: sin",
    );
    expect(() => calculateExpression("sin(1")).toThrow(
      "Missing ) for function sin",
    );
    expect(() => calculateExpression("")).toThrow("Unexpected token: end");
  });

  it("rejects non-finite results", () => {
    expect(() => calculateExpression("1/0")).toThrow("finite number");
  });
});

describe("searxng helpers branch coverage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("throws on non-ok responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response("nope", { status: 500, statusText: "Server Error" }),
      ),
    );
    await expect(
      fetchSearxngResults(new URL("http://searxng.test/search")),
    ).rejects.toThrow("SearXNG search failed with 500 Server Error");
  });

  it("returns the results array or an empty list", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ results: [{ title: "t", url: "u" }] }),
      ),
    );
    const withResults = await fetchSearxngResults(
      new URL("http://searxng.test/search"),
    );
    expect(withResults).toEqual([{ title: "t", url: "u" }]);

    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ nope: true })));
    const without = await fetchSearxngResults(
      new URL("http://searxng.test/search"),
    );
    expect(without).toEqual([]);
  });

  it("normalizes engines from arrays, singular engine, or nothing", () => {
    const normalized = normalizeSearxngResults(
      [
        { title: "a", url: "u", engines: ["google", 42] },
        { title: "b", url: "u", engine: "duckduckgo" },
        { title: "c", url: "u" },
      ] as never,
      10,
    );
    expect(normalized[0].engines).toEqual(["google"]);
    expect(normalized[1].engines).toEqual(["duckduckgo"]);
    expect(normalized[2].engines).toEqual([]);
  });

  it("normalizes results with missing content and score", () => {
    const normalized = normalizeSearxngResults(
      [{ title: "a", url: "u" }] as never,
      10,
    );
    expect(normalized[0].snippet).toBe("");
    expect(normalized[0].score).toBeNull();
  });

  it("summarizes results with and without snippets", () => {
    const summary = summarizeSearchResults([
      { title: "A", url: "ua", snippet: "sa", score: null, engines: [] },
      { title: "B", url: "ub", snippet: "", score: null, engines: [] },
    ]);
    expect(summary).toContain("1. A — sa");
    expect(summary).toContain("2. B\nub");
    expect(summary).not.toContain("2. B —");
  });
});