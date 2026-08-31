import {
  projectToolMessagePayload,
  projectToolPayloadForDisplay,
  REDACTED_VALUE,
  safeChatErrorMessage,
  safeToolErrorMessage,
} from "@/modules/tool/safe-payload";
import { describe, expect, it } from "vitest";

describe("safe payload branch coverage", () => {
  it("redacts every secret key spelling", () => {
    const payload = projectToolPayloadForDisplay({
      Authorization: "Bearer x",
      cookie: "c",
      Cookies: "c",
      credential: "c",
      credentials: "c",
      password: "p",
      passwd: "p",
      sig: "s",
      signature: "s",
      secret: "s",
      token: "t",
      "X-Api-Key": "k",
      access_token: "t",
      refresh_token: "t",
      id_token: "t",
      client_secret: "s",
      privateKey: "k",
      signingKey: "k",
      webhookSecret: "s",
      connectionString: "c",
    });
    for (const value of Object.values(
      payload as Record<string, unknown>,
    )) {
      expect(value).toBe(REDACTED_VALUE);
    }
  });

  it("redacts env containers and their arrays", () => {
    const payload = projectToolPayloadForDisplay({
      env: { PATH: "/bin" },
      environment: ["a", "b"],
    }) as Record<string, unknown>;
    expect(payload.env).toEqual({ PATH: REDACTED_VALUE });
    expect(payload.environment).toEqual([REDACTED_VALUE, REDACTED_VALUE]);
  });

  it("redacts obviously secret strings and inline secrets", () => {
    expect(
      projectToolPayloadForDisplay({ note: "Bearer abc123" }),
    ).toEqual({ note: REDACTED_VALUE });
    expect(
      projectToolPayloadForDisplay({ note: "Basic dXNlcjpwYXNz" }),
    ).toEqual({ note: REDACTED_VALUE });
    expect(
      projectToolPayloadForDisplay({
        note: "-----BEGIN RSA PRIVATE KEY-----abc",
      }),
    ).toEqual({ note: REDACTED_VALUE });
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.dGVzdA";
    expect(projectToolPayloadForDisplay({ note: jwt })).toEqual({
      note: REDACTED_VALUE,
    });
    expect(
      projectToolPayloadForDisplay({
        log: "auth: bearer live_123 ok",
      }),
    ).toEqual({ log: "auth: bearer [REDACTED] ok" });
    expect(
      projectToolPayloadForDisplay({
        log: "password=hunter2 and more",
      }),
    ).toEqual({ log: "password=[REDACTED] and more" });
    expect(
      projectToolPayloadForDisplay({ log: `saw ${jwt} inline` }),
    ).toEqual({ log: `saw ${REDACTED_VALUE} inline` });
  });

  it("projects urls with credentials and secret query params", () => {
    expect(
      projectToolPayloadForDisplay({
        url: "https://user:pass@api.example.com/?token=abc&safe=1",
      }),
    ).toEqual({
      url: "https://%5BREDACTED%5D:%5BREDACTED%5D@api.example.com/?token=%5BREDACTED%5D&safe=1",
    });
    expect(
      projectToolPayloadForDisplay({ url: "data:text/plain;base64,abc" }),
    ).toEqual({ url: "[DATA URL OMITTED]" });
    expect(
      projectToolPayloadForDisplay({ url: "not a url at all" }),
    ).toEqual({ url: "not a url at all" });
  });

  it("truncates long strings, deep nesting, circular refs, arrays, and objects", () => {
    const long = projectToolPayloadForDisplay({
      text: "x".repeat(600),
    }) as { text: string };
    expect((long.text as string).length).toBeLessThan(600);
    expect(long.text).toContain("[TRUNCATED]");

    const deep = projectToolPayloadForDisplay(
      { a: { b: { c: { d: { e: { f: "deep" } } } } } },
      { maxDepth: 2 },
    );
    expect(JSON.stringify(deep)).toContain("[TRUNCATED]");

    const circular: Record<string, unknown> = { a: 1 };
    circular.self = circular;
    expect(projectToolPayloadForDisplay(circular)).toEqual({
      a: 1,
      self: "[CIRCULAR]",
    });

    const array = projectToolPayloadForDisplay(
      { items: Array.from({ length: 25 }, (_, i) => i) },
      { maxArrayItems: 20 },
    ) as { items: unknown[] };
    expect((array.items as unknown[]).length).toBe(21);
    expect((array.items as unknown[])[20]).toBe("[TRUNCATED]");

    const manyKeys = projectToolPayloadForDisplay(
      Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`k${i}`, i])),
      { maxObjectKeys: 40 },
    ) as Record<string, unknown>;
    expect(manyKeys.__truncated__).toBe("10 additional fields");

    expect(projectToolPayloadForDisplay({ big: BigInt(10) })).toEqual({
      big: "10",
    });
  });

  it("passes through primitives and nulls", () => {
    expect(projectToolPayloadForDisplay(null)).toBeNull();
    expect(projectToolPayloadForDisplay(undefined)).toBeNull();
    expect(projectToolPayloadForDisplay(42)).toBe(42);
    expect(projectToolPayloadForDisplay(true)).toBe(true);
  });

  it("projects message payloads with looser limits", () => {
    const payload = projectToolMessagePayload({ ok: true });
    expect(payload).toEqual({ ok: true });
  });

  it("builds safe tool error messages", () => {
    expect(safeToolErrorMessage(new Error("boom"), "fallback")).toBe("boom");
    expect(safeToolErrorMessage("not an error", "fallback")).toBe("fallback");
    expect(safeToolErrorMessage(new Error(""), "fallback")).toBe("fallback");
    expect(
      safeToolErrorMessage(
        new Error("call https://u:p@api.example.com/?token=t failed"),
        "fallback",
      ),
    ).toBe(
      "call https://%5BREDACTED%5D:%5BREDACTED%5D@api.example.com/?token=%5BREDACTED%5D failed",
    );
    expect(
      safeToolErrorMessage(new Error("Bearer secret"), "fallback"),
    ).toBe("fallback");
  });

  it("builds safe chat error messages", () => {
    expect(safeChatErrorMessage(new Error("chat boom"), "fallback")).toBe(
      "chat boom",
    );
    expect(safeChatErrorMessage("raw string", "fallback")).toBe("raw string");
    expect(safeChatErrorMessage(null, "fallback")).toBe("fallback");
    expect(safeChatErrorMessage(new Error("Bearer x"), "fallback")).toBe(
      "fallback",
    );
  });
});