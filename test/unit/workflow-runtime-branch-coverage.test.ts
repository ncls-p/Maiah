import {
  calculateNumber,
  condition,
  currentDate,
  delayFlow,
  filterList,
  isPrivateIpv4,
  sliceList,
  sortList,
  stopFlow,
} from "@/modules/workflows/runtime.calculate-number";
import {
  manualTrigger,
  matchesComparison,
  parseJson,
  pickData,
  removeData,
  renameData,
  setData,
  stringifyJson,
  templateData,
  transformText,
} from "@/modules/workflows/runtime.matches-comparison";
import { describe, expect, it } from "vitest";

type NodeCall = {
  input: unknown;
  params: Record<string, unknown>;
  context?: { get: (key: string) => Promise<unknown> };
  signal?: AbortSignal;
};

describe("workflow runtime branch coverage", () => {
  it("calculates numbers with every operation and defaults", async () => {
    expect((await calculateNumber({ input: 5, params: {} } as never))
      .output).toBe(5);
    expect(
      (
        await calculateNumber({
          input: 10,
          params: { operation: "subtract", operand: 4 },
        } as never)
      ).output,
    ).toBe(6);
    expect(
      (
        await calculateNumber({
          input: 10,
          params: { operation: "multiply", operand: 4 },
        } as never)
      ).output,
    ).toBe(40);
    expect(
      (
        await calculateNumber({
          input: 10,
          params: { operation: "divide", operand: 4 },
        } as never)
      ).output,
    ).toBe(2.5);
    expect(
      (
        await calculateNumber({
          input: 10,
          params: { operation: "modulo", operand: 4 },
        } as never)
      ).output,
    ).toBe(2);
    expect(
      (
        await calculateNumber({
          input: 10.6,
          params: { operation: "round" },
        } as never)
      ).output,
    ).toBe(11);
    expect(
      (
        await calculateNumber({
          input: { value: 3 },
          params: { path: "value", operation: "add", operand: 1, outputPath: "sum" },
        } as never)
      ).output,
    ).toEqual({ value: 3, sum: 4 });
  });

  it("rejects non-finite numbers and division by zero", async () => {
    await expect(
      calculateNumber({ input: "abc", params: {} } as never),
    ).rejects.toThrow("finite numbers");
    await expect(
      calculateNumber({ input: 1, params: { operand: "x" } } as never),
    ).rejects.toThrow("finite numbers");
    await expect(
      calculateNumber({
        input: 1,
        params: { operation: "divide", operand: 0 },
      } as never),
    ).rejects.toThrow("Division by zero");
    await expect(
      calculateNumber({
        input: 1,
        params: { operation: "modulo", operand: 0 },
      } as never),
    ).rejects.toThrow("Division by zero");
  });

  it("filters lists with comparison operators and defaults", async () => {
    const input = [
      { name: "a", score: 1 },
      { name: "b", score: 5 },
    ];
    const result = await filterList({
      input,
      params: { field: "score", operator: "greaterThan", value: 2 },
    } as never);
    expect(result.output).toEqual([{ name: "b", score: 5 }]);
    const defaulted = await filterList({
      input: [1, 2, 2],
      params: { value: 2 },
    } as never);
    expect(defaulted.output).toEqual([2, 2]);
    await expect(
      filterList({ input: { not: "a list" }, params: {} } as never),
    ).rejects.toThrow("must be a list");
  });

  it("sorts lists ascending, descending, and with nulls", async () => {
    const input = [{ n: "b" }, { n: null }, { n: "a" }, { n: "b" }];
    const ascending = await sortList({
      input,
      params: { field: "n" },
    } as never);
    expect(ascending.output).toEqual([
      { n: "a" },
      { n: "b" },
      { n: "b" },
      { n: null },
    ]);
    const descending = await sortList({
      input,
      params: { field: "n", direction: "descending" },
    } as never);
    expect(descending.output).toEqual([
      { n: "b" },
      { n: "b" },
      { n: "a" },
      { n: null },
    ]);
  });

  it("slices lists with clamped start and limit", async () => {
    const input = [0, 1, 2, 3, 4];
    expect((await sliceList({ input, params: {} } as never)).output).toEqual(
      [0, 1, 2, 3, 4],
    );
    expect(
      (
        await sliceList({
          input,
          params: { start: -2, limit: 0 },
        } as never)
      ).output,
    ).toEqual([0, 1, 2, 3, 4]);
    expect(
      (
        await sliceList({
          input,
          params: { start: 1, limit: 2, outputPath: "window" },
        } as never)
      ).output,
    ).toEqual({ window: [1, 2] });
  });

  it("evaluates conditions to true and false actions", async () => {
    const trueCall = await condition({
      input: { count: 3 },
      params: { path: "count", operator: "greaterThan", value: 1 },
    } as never);
    expect(trueCall.action).toBe("true");
    const falseCall = await condition({
      input: { count: 3 },
      params: { path: "count", operator: "greaterThan", value: 9 },
    } as never);
    expect(falseCall.action).toBe("false");
    const defaulted = await condition({
      input: undefined,
      params: {},
    } as never);
    expect(defaulted.action).toBe("true");
  });

  it("delays with clamped durations", async () => {
    const output = await delayFlow({ input: "x", params: {} } as never);
    expect(output.output).toBe("x");
  });

  it("stops the flow with an interpolated message", async () => {
    const output = await stopFlow({
      input: { name: "Ada" },
      params: { message: "Done for {{name}}" },
    } as never);
    expect(output.output).toEqual({
      name: "Ada",
      workflowResult: "Done for Ada",
    });
    const defaulted = await stopFlow({ input: "x", params: {} } as never);
    expect(defaulted.output.workflowResult).toBe("");
  });

  it("writes current dates in every format", async () => {
    const iso = await currentDate({ input: {}, params: {} } as never);
    expect(String(iso.output)).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const timestamp = await currentDate({
      input: {},
      params: { format: "timestamp" },
    } as never);
    expect(typeof timestamp.output).toBe("number");
    const date = await currentDate({
      input: {},
      params: { format: "date", outputPath: "today" },
    } as never);
    expect(date.output).toEqual({ today: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });
  });

  it("classifies private and public ipv4 addresses", () => {
    expect(isPrivateIpv4("10.1.2.3")).toBe(true);
    expect(isPrivateIpv4("127.0.0.1")).toBe(true);
    expect(isPrivateIpv4("169.254.1.1")).toBe(true);
    expect(isPrivateIpv4("172.20.1.1")).toBe(true);
    expect(isPrivateIpv4("192.168.0.1")).toBe(true);
    expect(isPrivateIpv4("224.0.0.1")).toBe(true);
    expect(isPrivateIpv4("0.1.1.1")).toBe(true);
    expect(isPrivateIpv4("8.8.8.8")).toBe(false);
    expect(isPrivateIpv4("not-an-ip")).toBe(true);
    expect(isPrivateIpv4("1.2.3")).toBe(true);
    expect(isPrivateIpv4("1.2.3.x")).toBe(true);
  });

  it("matches every comparison operator", () => {
    expect(matchesComparison("x", "exists", undefined)).toBe(true);
    expect(matchesComparison(null, "exists", undefined)).toBe(false);
    expect(matchesComparison(undefined, "isEmpty", undefined)).toBe(true);
    expect(matchesComparison(null, "isEmpty", undefined)).toBe(true);
    expect(matchesComparison("", "isEmpty", undefined)).toBe(true);
    expect(matchesComparison([], "isEmpty", undefined)).toBe(true);
    expect(matchesComparison({}, "isEmpty", undefined)).toBe(true);
    expect(matchesComparison([1], "isEmpty", undefined)).toBe(false);
    expect(matchesComparison(1, "notEquals", 2)).toBe(true);
    expect(matchesComparison(5, "greaterThan", 4)).toBe(true);
    expect(matchesComparison(3, "lessThan", 4)).toBe(true);
    expect(matchesComparison(["a", "b"], "contains", "b")).toBe(true);
    expect(matchesComparison("hello world", "contains", "world")).toBe(true);
    expect(matchesComparison("hello", "startsWith", "he")).toBe(true);
    expect(matchesComparison("same", "equals", "same")).toBe(true);
    expect(matchesComparison("other", "equals", "same")).toBe(false);
  });

  it("resolves the manual trigger from context", async () => {
    const output = await manualTrigger({
      input: undefined,
      params: {},
      context: { get: async () => "triggered" },
    } as unknown as never);
    expect(output.output).toBe("triggered");
  });

  it("sets data from templated values", async () => {
    const output = await setData({
      input: { who: "Ada" },
      params: { values: { greeting: "Hi {{who}}", blank: "" } },
    } as never);
    expect(output.output).toEqual({
      who: "Ada",
      greeting: "Hi Ada",
      blank: "",
    });
  });

  it("picks data for existing paths only", async () => {
    const output = await pickData({
      input: { a: 1, nested: { b: 2 } },
      params: { paths: ["a", "missing", "nested.b", 0, ""] },
    } as never);
    expect(output.output).toEqual({ a: 1, nested: { b: 2 } });
    const defaulted = await pickData({
      input: { a: 1 },
      params: {},
    } as never);
    expect(defaulted.output).toEqual({});
  });

  it("removes data by path", async () => {
    const output = await removeData({
      input: { a: 1, b: 2 },
      params: { paths: ["a"] },
    } as never);
    expect(output.output).toEqual({ b: 2 });
    const defaulted = await removeData({
      input: { a: 1 },
      params: {},
    } as never);
    expect(defaulted.output).toEqual({ a: 1 });
  });

  it("renames data when the source path exists", async () => {
    const renamed = await renameData({
      input: { from: 1 },
      params: { from: "from", to: "to" },
    } as never);
    expect(renamed.output).toEqual({ to: 1 });
    const missing = await renameData({
      input: { other: 1 },
      params: { from: "nope", to: "to" },
    } as never);
    expect(missing.output).toEqual({ other: 1 });
    const defaulted = await renameData({
      input: { other: 1 },
      params: {},
    } as never);
    expect(defaulted.output).toEqual({ other: 1 });
  });

  it("writes templated data to the output path", async () => {
    const output = await templateData({
      input: { name: "Ada" },
      params: { template: "Hello {{name}}", outputPath: "greeting" },
    } as never);
    expect(output.output).toEqual({ name: "Ada", greeting: "Hello Ada" });
    const defaulted = await templateData({
      input: { name: "Ada" },
      params: {},
    } as never);
    expect(defaulted.output).toBe("");
  });

  it("parses and stringifies json with defaults and errors", async () => {
    const parsed = await parseJson({
      input: { raw: '{"a":1}' },
      params: { path: "raw", outputPath: "parsed" },
    } as never);
    expect(parsed.output).toEqual({ raw: '{"a":1}', parsed: { a: 1 } });
    const defaulted = await parseJson({
      input: '{"a":1}',
      params: {},
    } as never);
    expect(defaulted.output).toEqual({ a: 1 });
    await expect(
      parseJson({ input: { raw: 42 }, params: { path: "raw" } } as never),
    ).rejects.toThrow("must be text");
    await expect(
      parseJson({ input: { raw: "{nope" }, params: { path: "raw" } } as never),
    ).rejects.toThrow("valid JSON");
    const stringified = await stringifyJson({
      input: { value: { a: 1 } },
      params: { path: "value", outputPath: "json" },
    } as never);
    expect(stringified.output).toEqual({ value: { a: 1 }, json: '{"a":1}' });
    const defaultedString = await stringifyJson({
      input: "raw",
      params: {},
    } as never);
    expect(defaultedString.output).toBe('"raw"');
  });

  it("transforms text with every operation", async () => {
    const upper = await transformText({
      input: { text: "abc" },
      params: { path: "text", operation: "uppercase", outputPath: "upper" },
    } as never);
    expect(upper.output).toEqual({ text: "abc", upper: "ABC" });
    const lowered = await transformText({
      input: { text: "ABC" },
      params: { path: "text", operation: "lowercase", outputPath: "out" },
    } as never);
    expect(lowered.output).toEqual({ text: "ABC", out: "abc" });
    const replaced = await transformText({
      input: { text: "a-b-c" },
      params: { path: "text", operation: "replace", search: "-", replacement: "_" },
    } as never);
    expect(replaced.output).toBe("a_b_c");
    const noSearch = await transformText({
      input: { text: "a-b" },
      params: { path: "text", operation: "replace" },
    } as never);
    expect(noSearch.output).toBe("a-b");
    const trimmed = await transformText({
      input: { text: "  padded  " },
      params: { path: "text" },
    } as never);
    expect(trimmed.output).toBe("padded");
    const defaulted = await transformText({
      input: "  x  ",
      params: {},
    } as never);
    expect(defaulted.output).toBe("x");
  });
});