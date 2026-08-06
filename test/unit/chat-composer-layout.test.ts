import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("chat composer layout", () => {
  it("renders usage impact in a separate responsive row", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/components/chat/chat-composer-body.tsx"),
      "utf8",
    );
    const primary = source.indexOf(
      'data-slot="chat-composer-primary-controls"',
    );
    const usage = source.indexOf('data-slot="chat-composer-usage"');

    expect(primary).toBeGreaterThan(-1);
    expect(usage).toBeGreaterThan(primary);
    expect(source).toContain("props.controls.secondary");
  });
});
