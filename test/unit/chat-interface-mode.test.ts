import { describe, expect, it } from "vitest";

import {
  CHAT_INTERFACE_MODE,
  CODING_INTERFACE_MODE,
  shouldAutoActivateCoding,
} from "@/app/[locale]/(workspace)/chat/chat-interface-mode";

describe("chat interface mode ownership", () => {
  it("allows the first automatic coding activation", () => {
    expect(shouldAutoActivateCoding(null)).toBe(true);
  });

  it("preserves an explicit user choice to stay in chat", () => {
    expect(shouldAutoActivateCoding(CHAT_INTERFACE_MODE)).toBe(false);
  });

  it("keeps coding updates visible after the user selects coding", () => {
    expect(shouldAutoActivateCoding(CODING_INTERFACE_MODE)).toBe(true);
  });
});
