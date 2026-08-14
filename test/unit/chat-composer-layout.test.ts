import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("chat composer layout", () => {
  it("keeps the queued messages panel compact, collapsed, and themed", () => {
    const source = fs.readFileSync(
      path.join(
        process.cwd(),
        "src/components/chat/chat-composer.chat-composer.tsx",
      ),
      "utf8",
    );

    expect(source).toContain('data-slot="chat-composer-queued"');
    expect(source).toContain("function QueuedMessagesPanel");
    expect(source).toContain("useState(false)");
    expect(source).toContain("composer-box overflow-hidden rounded-3xl");
    expect(source).toContain("max-h-[min(32vh,14rem)]");
    expect(source).toContain("field-sizing-fixed");
    expect(source).toContain("max-h-24 min-h-9 resize-none overflow-y-auto");
    expect(source).toContain("Math.min(\n                    3,");
  });

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

    expect(bodySource).toContain(
      "grid min-h-12 min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center",
    );
    expect(bodySource).toContain('data-slot="chat-composer-primary-action"');
    expect(bodySource).toContain("props.sending ? (");
    expect(bodySource).toContain('aria-label={t("stopGeneration")}');
    expect(bodySource).toContain('aria-label={t("sendMessage")}');
    expect(bodySource).not.toContain('t("sendHint")');
    expect(bodySource).not.toContain('t("queueHint")');
    expect(selectorSource).toContain("grid-cols-[minmax(0,1fr)_auto_auto]");
    expect(selectorSource).toContain("min-[480px]:flex-nowrap");
    expect(selectorSource).toContain("props.needsSetup");
    expect(selectorSource).not.toContain("!props.canChat");
    expect(selectorSource).toContain("SelectedAssistantTrigger");
  });

  it("offers camera capture and dictation from the composer", () => {
    const mediaSource = fs.readFileSync(
      path.join(
        process.cwd(),
        "src/components/chat/chat-composer-media-controls.tsx",
      ),
      "utf8",
    );

    expect(mediaSource).toContain('data-slot="chat-composer-file-input"');
    expect(mediaSource).toContain("accept={COMPOSER_FILE_ACCEPT}");
    expect(mediaSource).toContain('accept="image/*"');
    expect(mediaSource).toContain('capture="environment"');
    expect(mediaSource).toContain('t("takePhoto")');
    expect(mediaSource).toContain('t("dictation")');
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

    expect(menuSource).toContain('data-slot="chat-capability-results"');
    expect(menuSource).toContain(
      'className="min-h-0 min-w-0 overflow-x-hidden overflow-y-auto',
    );
    expect(menuSource).toContain("grid min-h-0 min-w-0 flex-1");
    expect(menuSource).toContain('className="min-w-0 overflow-hidden"');
    expect(menuSource).toContain('className="min-w-0 flex-1 overflow-hidden"');
    expect(menuSource).toContain("title={capability.description}");
    expect(navigationSource).toContain("overflow-x-auto");
    expect(navigationSource).toContain("sm:flex-col");
  });
});
