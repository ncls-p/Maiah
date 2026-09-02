import { knowledgeFileAccept } from "@/modules/knowledge/upload-accept";
import { describe, expect, it } from "vitest";

describe("knowledge upload file picker", () => {
  it("offers common JavaScript and TypeScript source files", () => {
    const accepted = new Set(knowledgeFileAccept.split(","));

    for (const extension of [
      ".js",
      ".jsx",
      ".mjs",
      ".cjs",
      ".ts",
      ".tsx",
      ".mts",
      ".cts",
    ]) {
      expect(accepted.has(extension), extension).toBe(true);
    }
  });
});
