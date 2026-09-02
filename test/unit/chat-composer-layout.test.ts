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
    const sliderSource = fs.readFileSync(
      path.join(process.cwd(), "src/components/chat/chat-reasoning-slider.tsx"),
      "utf8",
    );
    const layoutSource = fs.readFileSync(
      path.join(
        process.cwd(),
        "src/components/chat/chat-layout.chat-layout.tsx",
      ),
      "utf8",
    );

    expect(bodySource).toContain(
      "grid min-h-12 min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-start",
    );
    expect(bodySource).toContain(
      "@xl/composer:items-center @xl/composer:gap-x-2 @xl/composer:px-3",
    );
    expect(bodySource).toContain('data-slot="chat-composer-primary-action"');
    expect(bodySource).toContain("props.sending ? (");
    expect(bodySource).toContain('aria-label={t("stopGeneration")}');
    expect(bodySource).toContain('aria-label={t("sendMessage")}');
    expect(bodySource).not.toContain('t("sendHint")');
    expect(bodySource).not.toContain('t("queueHint")');
    expect(selectorSource).toContain(
      "flex min-w-0 flex-1 flex-nowrap items-center gap-1 @xl/composer:gap-2",
    );
    expect(selectorSource).toContain("block truncate");
    expect(selectorSource).toContain("props.needsSetup");
    expect(selectorSource).not.toContain("!props.canChat");
    expect(selectorSource).toContain("SelectedAssistantTrigger");
    expect(selectorSource).toContain(
      "hidden size-3.5 shrink-0 text-muted-foreground @xl/composer:block",
    );
    expect(bodySource).toContain(
      "onPointerDownCapture={preserveComposerTextFocus}",
    );
    expect(bodySource).toContain("element.blur()");
    expect(layoutSource).toContain(
      "flex min-w-0 flex-nowrap items-center gap-1",
    );
    expect(layoutSource).toContain("shrink-0 items-center");
    expect(sliderSource).toContain('data-slot="chat-reasoning-picker"');
    expect(sliderSource).toContain('size="icon"');
    expect(sliderSource).toContain("size-10 rounded-xl");
    expect(sliderSource).toContain("@xl/composer:hidden");
  });

  it("adapts the action row to the composer width, not the viewport", () => {
    const bodySource = fs.readFileSync(
      path.join(process.cwd(), "src/components/chat/chat-composer-body.tsx"),
      "utf8",
    );
    const impactSource = fs.readFileSync(
      path.join(process.cwd(), "src/components/chat/chat-composer-impact.tsx"),
      "utf8",
    );
    const menuSource = fs.readFileSync(
      path.join(
        process.cwd(),
        "src/components/chat/chat-tools-menu.chat-tools-menu.tsx",
      ),
      "utf8",
    );

    // The composer is a container so the split coding view (narrow chat pane
    // on a wide screen) gets the same compact controls as a phone.
    expect(bodySource).toContain("@container/composer");
    // Below @sm the assistant controls wrap to their own row instead of
    // overlapping the send button.
    expect(bodySource).toContain(
      "col-span-3 col-start-1 row-start-2 min-w-0 pb-1 @sm/composer:col-span-1 @sm/composer:col-start-2 @sm/composer:row-start-1",
    );
    expect(bodySource).not.toMatch(/\bsm:(items-center|gap-x-2|px-3)\b/);
    const menuNavigationSource = fs.readFileSync(
      path.join(
        process.cwd(),
        "src/components/chat/chat-tools-menu.catalog-navigation.tsx",
      ),
      "utf8",
    );
    expect(menuNavigationSource).toContain(
      'className="hidden @xl/composer:inline"',
    );
    expect(menuNavigationSource).toContain(
      'className="hidden font-mono text-[0.65rem] tabular-nums @xl/composer:inline"',
    );
    expect(menuSource).toContain("<ChatCapabilityTriggerLabel");
    expect(menuSource).not.toContain("sm:inline");
    // The usage chip is a real button opening a popover (works on touch,
    // unlike hover tooltips).
    expect(impactSource).toContain('data-slot="chat-composer-impact-trigger"');
    expect(impactSource).toContain("PopoverTrigger");
    expect(impactSource).not.toContain("TooltipTrigger");
    expect(impactSource).toContain('t("impact.inputTokensLabel")');
    expect(impactSource).toContain('t("impact.outputTokensLabel")');
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
    expect(mediaSource).toContain('COMPOSER_FILE_ACCEPT = "*/*"');
    expect(mediaSource).toContain('accept="image/*"');
    expect(mediaSource).toContain('capture="environment"');
    expect(mediaSource).toContain('t("takePhoto")');
    expect(mediaSource).toContain('t("dictation")');
  });

  it("uploads long pasted text instead of sending it inline", () => {
    const source = fs.readFileSync(
      path.join(
        process.cwd(),
        "src/components/chat/chat-composer.chat-composer.tsx",
      ),
      "utf8",
    );

    expect(source).toContain("shouldUploadPastedText(text)");
    expect(source).toContain("createPastedTextUploadFile(text)");
  });

  it("keeps the mobile app navigation visible while the composer is focused", () => {
    const keyboardSource = fs.readFileSync(
      path.join(process.cwd(), "src/app/styles/mobile-keyboard.pcss"),
      "utf8",
    );

    expect(keyboardSource).toContain("height: 100dvh");
    expect(keyboardSource).not.toContain(".mobile-app-navigation");
    expect(keyboardSource).not.toContain("textarea:focus");
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

    expect(navigationSource).toContain(
      'className="hidden font-mono text-[0.65rem] tabular-nums @xl/composer:inline"',
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
