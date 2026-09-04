import { describe, expect, it } from "vitest";

import { applyExactTextEdits } from "@/modules/code-workspace/runtime.edit";

describe("code workspace runtime edits", () => {
  it("applies multiple disjoint replacements against the original file", () => {
    expect(
      applyExactTextEdits("alpha\nbeta\ngamma\n", [
        { oldText: "alpha", newText: "first" },
        { oldText: "gamma", newText: "third" },
      ]),
    ).toBe("first\nbeta\nthird\n");
  });

  it("rejects ambiguous and overlapping replacements", () => {
    expect(() =>
      applyExactTextEdits("same same", [{ oldText: "same", newText: "x" }]),
    ).toThrow(/not unique/i);
    expect(() =>
      applyExactTextEdits("abcdef", [
        { oldText: "abcd", newText: "x" },
        { oldText: "cdef", newText: "y" },
      ]),
    ).toThrow(/overlap/i);
  });
});
