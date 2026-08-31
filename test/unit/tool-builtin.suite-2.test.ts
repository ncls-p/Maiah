import type { BuiltInToolDefinition } from "@/modules/tool/builtin-tools";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

let getBuiltInToolByName: (name: string) => BuiltInToolDefinition | null;

beforeAll(async () => {
  process.env.APP_ENCRYPTION_KEY =
    "0000000000000000000000000000000000000000000000000000000000000000";
  process.env.APP_ENCRYPTION_KEY_ID = "default";

  getBuiltInToolByName = (await import("@/modules/tool/builtin-tools"))
    .getBuiltInToolByName;
});

afterEach(() => {
  vi.unstubAllGlobals();
});
describe("web_search tool", () => {
  it("queries SearXNG and normalizes results", async () => {
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      expect(String(url)).toContain("/search?");
      expect(String(url)).toContain("format=json");
      expect(String(url)).toContain("q=maiah");
      expect(init?.headers).toMatchObject({
        Accept: "application/json",
        "X-Forwarded-For": "127.0.0.1",
        "X-Real-IP": "127.0.0.1",
        "User-Agent": "ai-hub-web-search/1.0",
      });
      return new Response(
        JSON.stringify({
          results: [
            {
              title: "Maiah",
              url: "https://example.com/maiah",
              content: "Workspace assistant platform",
              score: 2.5,
              engines: ["duckduckgo"],
            },
            {
              title: "Ignored result without URL",
              content: "Missing URL",
            },
          ],
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const tool = getBuiltInToolByName("web_search");
    expect(tool).not.toBeNull();
    const result = (await tool!.execute({
      query: "maiah",
      limit: 3,
    })) as {
      ok: boolean;
      query: string;
      searchedQuery: string;
      successfulQuery: string;
      resultCount: number;
      error: string | null;
      summary: string;
      results: Array<{ title: string; url: string; engines: string[] }>;
    };

    expect(result.ok).toBe(true);
    expect(result.query).toBe("maiah");
    expect(result.searchedQuery).toMatch(/^maiah today \d{4}-\d{2}-\d{2}$/);
    expect(result.successfulQuery).toBe(result.searchedQuery);
    expect(result.resultCount).toBe(1);
    expect(result.error).toBeNull();
    expect(result.summary).toContain("1. Maiah");
    expect(result.summary).toContain("Workspace assistant platform");
    expect(result.summary).toContain("https://example.com/maiah");
    expect(result.results).toEqual([
      {
        title: "Maiah",
        url: "https://example.com/maiah",
        snippet: "Workspace assistant platform",
        score: 2.5,
        engines: ["duckduckgo"],
      },
    ]);
  });

  it("falls back to the original query when the dated query is empty", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ results: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            results: [
              {
                title: "Fallback result",
                url: "https://example.com/fallback",
                content: "Result from the original query",
                engine: "brave",
              },
            ],
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const tool = getBuiltInToolByName("web_search");
    expect(tool).not.toBeNull();
    const result = (await tool!.execute({
      query: "maiah",
      limit: 3,
    })) as {
      ok: boolean;
      searchedQuery: string;
      successfulQuery: string;
      resultCount: number;
      results: Array<{ title: string; url: string; engines: string[] }>;
    };

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(
      new URL(String(fetchMock.mock.calls[0]?.[0])).searchParams.get("q"),
    ).toBe(result.searchedQuery);
    expect(
      new URL(String(fetchMock.mock.calls[1]?.[0])).searchParams.get("q"),
    ).toBe("maiah");
    expect(result.ok).toBe(true);
    expect(result.successfulQuery).toBe("maiah");
    expect(result.resultCount).toBe(1);
    expect(result.results).toEqual([
      {
        title: "Fallback result",
        url: "https://example.com/fallback",
        snippet: "Result from the original query",
        score: null,
        engines: ["brave"],
      },
    ]);
  });
});
