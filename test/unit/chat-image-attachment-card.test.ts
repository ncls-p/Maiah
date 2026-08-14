import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("chat image attachment card", () => {
  it("sizes the preview to the image instead of a fixed tall frame", () => {
    const source = fs.readFileSync(
      path.join(
        process.cwd(),
        "src/components/chat/chat-image-attachment-card.tsx",
      ),
      "utf8",
    );

    expect(source).toContain("<img");
    expect(source).toContain("max-h-[min(20rem,50vh)]");
    expect(source).toContain("object-contain");
    expect(source).not.toContain("h-64");
    expect(source).not.toContain("backgroundImage");
  });
});
