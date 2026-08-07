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

  it("keeps the primary composer controls compact without an inline hint", () => {
    const bodySource = fs.readFileSync(
      path.join(process.cwd(), "src/components/chat/chat-composer-body.tsx"),
      "utf8",
    );
    const selectorSource = fs.readFileSync(
      path.join(process.cwd(), "src/components/chat/chat-agent-selector.tsx"),
      "utf8",
    );

    expect(bodySource).toContain("min-h-12 min-w-0 items-center");
    expect(bodySource).not.toContain('t("sendHint")');
    expect(bodySource).not.toContain('t("queueHint")');
    expect(selectorSource).toContain("sm:flex-nowrap");
  });

  it("keeps the capability catalog bounded and independently scrollable", () => {
    const menuSource = fs.readFileSync(
      path.join(
        process.cwd(),
        "src/components/chat/chat-tools-menu.chat-tools-menu.tsx",
      ),
      "utf8",
    );
    const navigationSource = fs.readFileSync(
      path.join(
        process.cwd(),
        "src/components/chat/chat-tools-menu.catalog-navigation.tsx",
      ),
      "utf8",
    );

    expect(menuSource).toContain(
      'data-slot="chat-capability-results" className="min-h-0 overflow-y-auto',
    );
    expect(menuSource).toContain("grid min-h-0 flex-1");
    expect(navigationSource).toContain("overflow-x-auto");
    expect(navigationSource).toContain("sm:flex-col");
  });
});
