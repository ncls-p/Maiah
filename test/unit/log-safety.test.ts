import { expect, it } from "vitest";
import { safeLogText, safeLogValue } from "@/lib/log-safety";
import { getLogContext, withLogContext } from "@/lib/log-context";

it("removes nested credentials, bodies and SQL bind parameters while keeping causes", () => {
  const error = new Error("Failed query\nparams: session-secret", {
    cause: Object.assign(new Error("DNS failed"), { code: "ENOTFOUND" }),
  });
  const result = JSON.stringify(
    safeLogValue({
      error,
      headers: { authorization: "credential" },
      nested: { password: "p-secret" },
      body: "private prompt",
      url: "https://user:pass@example.com/test?token=hidden",
    }),
  );
  for (const secret of [
    "session-secret",
    "credential",
    "p-secret",
    "private prompt",
    "user:pass",
    "token=hidden",
  ])
    expect(result).not.toContain(secret);
  expect(result).toContain("ENOTFOUND");
  expect(result).toContain("DNS failed");
});

it("handles cycles and bigint without crashing the failing request", () => {
  const data: Record<string, unknown> = { count: BigInt(1) };
  data.self = data;
  expect(safeLogValue(data)).toEqual({ count: "1", self: "[Circular]" });
  expect(safeLogText("Authorization: Bearer abc123")).not.toContain("abc123");
  expect(
    safeLogText('remote: {"password":"several secret words"}'),
  ).not.toContain("words");
});

it("isolates correlation IDs between concurrent requests", async () => {
  const results = await Promise.all(
    ["a", "b"].map((requestId) =>
      withLogContext({ requestId }, async () => {
        await Promise.resolve();
        return getLogContext().requestId;
      }),
    ),
  );
  expect(results).toEqual(["a", "b"]);
  expect(getLogContext()).toEqual({});
});
