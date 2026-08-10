import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = process.cwd();
const sourceRoot = path.join(projectRoot, "src");

const customControls = [
  "Input",
  "Textarea",
  "SelectTrigger",
  "Switch",
  "Checkbox",
] as const;
const accessibleNameAttributes = ["id=", "aria-label", "aria-labelledby"];

function listTsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = path.join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) return listTsxFiles(fullPath);
    return entry.endsWith(".tsx") ? [fullPath] : [];
  });
}

function lineNumber(source: string, index: number) {
  return source.slice(0, index).split("\n").length;
}

describe("accessibility guardrails", () => {
  it("keeps custom form controls programmatically labelled", () => {
    const failures: string[] = [];

    for (const file of listTsxFiles(sourceRoot)) {
      const source = readFileSync(file, "utf8");
      for (const tag of customControls) {
        const pattern = new RegExp(`<${tag}\\b`, "g");
        for (const match of source.matchAll(pattern)) {
          const start = match.index ?? 0;
          const tagEnd = source.indexOf(">", start);
          const selfClosingEnd = source.indexOf("/>", start);
          const end =
            selfClosingEnd >= 0 &&
            (tag !== "SelectTrigger" || selfClosingEnd < tagEnd)
              ? selfClosingEnd + 2
              : tagEnd >= 0
                ? tagEnd + 1
                : start;
          const openingTag = source.slice(start, end);
          const hasAccessibleName = accessibleNameAttributes.some((attr) =>
            openingTag.includes(attr),
          );
          if (!hasAccessibleName) {
            failures.push(
              `${path.relative(projectRoot, file)}:${lineNumber(source, start)} <${tag}>`,
            );
          }
        }
      }
    }

    expect(failures).toEqual([]);
  });
});
