import { describe, expect, it, vi } from "vitest";

import { preserveComposerTextFocus } from "@/components/chat/chat-composer-mobile";

function pointerEvent(
  closest: (selector: string) => unknown,
  pointerType: string,
) {
  return {
    pointerType,
    target: { closest } as unknown as EventTarget,
    preventDefault: vi.fn(),
  };
}

describe("preserveComposerTextFocus", () => {
  it("prevents default on touch taps of composer buttons", () => {
    const event = pointerEvent(
      (selector) => (selector.includes("button") ? {} : null),
      "touch",
    );

    preserveComposerTextFocus(event);

    expect(event.preventDefault).toHaveBeenCalledOnce();
  });

  it("leaves textarea and mouse taps alone", () => {
    const textareaEvent = pointerEvent(
      (selector) => (selector.includes("textarea") ? {} : null),
      "touch",
    );
    const mouseEvent = pointerEvent(
      (selector) => (selector.includes("button") ? {} : null),
      "mouse",
    );

    preserveComposerTextFocus(textareaEvent);
    preserveComposerTextFocus(mouseEvent);

    expect(textareaEvent.preventDefault).not.toHaveBeenCalled();
    expect(mouseEvent.preventDefault).not.toHaveBeenCalled();
  });
});
