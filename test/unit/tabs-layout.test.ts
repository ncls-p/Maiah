import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function listTsxFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const filePath = path.join(directory, entry);
    if (statSync(filePath).isDirectory()) return listTsxFiles(filePath);
    return filePath.endsWith(".tsx") ? [filePath] : [];
  });
}

describe("tabs layout", () => {
  it("wraps shared horizontal tab lists instead of making callers scroll", () => {
    const sourceRoot = path.join(process.cwd(), "src");
    const tabsSource = readFileSync(
      path.join(sourceRoot, "components/ui/tabs.tsx"),
      "utf8",
    );
    const scrollingCallers = listTsxFiles(sourceRoot).flatMap((filePath) => {
      const source = readFileSync(filePath, "utf8");
      return [...source.matchAll(/<TabsList\b[^>]*>/gu)]
        .filter(([openingTag]) =>
          /overflow-x-(?:auto|scroll)|flex-nowrap/u.test(openingTag),
        )
        .map(() => path.relative(process.cwd(), filePath));
    });

    expect(tabsSource).toContain("group-data-horizontal/tabs:flex-wrap");
    expect(scrollingCallers).toEqual([]);
  });
});
