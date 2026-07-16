import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  APP_SIDEBAR_WIDTH_STORAGE_EVENT,
  APP_SIDEBAR_WIDTH_STORAGE_KEY,
  clampAppSidebarWidth,
  getStoredAppSidebarWidth,
  setStoredAppSidebarWidth,
  subscribeAppSidebarWidth,
} from "@/lib/sidebar-layout";

const storedValues = new Map<string, string>();
const getItem = vi.fn((key: string) => storedValues.get(key) ?? null);
const setItem = vi.fn((key: string, value: string) => {
  storedValues.set(key, value);
});
const addEventListener = vi.fn();
const removeEventListener = vi.fn();
const dispatchEvent = vi.fn();

beforeEach(() => {
  storedValues.clear();
  vi.clearAllMocks();
  vi.stubGlobal("window", {
    localStorage: { getItem, setItem },
    addEventListener,
    removeEventListener,
    dispatchEvent,
  });
});

describe("sidebar layout persistence", () => {
  it("rounds and clamps sidebar widths", () => {
    expect(clampAppSidebarWidth(200)).toBe(240);
    expect(clampAppSidebarWidth(302.6)).toBe(303);
    expect(clampAppSidebarWidth(500)).toBe(400);
  });

  it("reads current, legacy, default, and invalid stored widths", () => {
    expect(getStoredAppSidebarWidth()).toBe(288);

    storedValues.set("workspace-sidebar-width", "312");
    expect(getStoredAppSidebarWidth()).toBe(312);

    storedValues.set(APP_SIDEBAR_WIDTH_STORAGE_KEY, "invalid");
    expect(getStoredAppSidebarWidth()).toBe(288);
  });

  it("subscribes and unsubscribes from width changes", () => {
    const callback = vi.fn();
    const unsubscribe = subscribeAppSidebarWidth(callback);

    expect(addEventListener).toHaveBeenCalledWith("storage", callback);
    expect(addEventListener).toHaveBeenCalledWith(
      APP_SIDEBAR_WIDTH_STORAGE_EVENT,
      callback,
    );

    unsubscribe();
    expect(removeEventListener).toHaveBeenCalledWith("storage", callback);
    expect(removeEventListener).toHaveBeenCalledWith(
      APP_SIDEBAR_WIDTH_STORAGE_EVENT,
      callback,
    );
  });

  it("stores a clamped width and broadcasts the change", () => {
    setStoredAppSidebarWidth(999);

    expect(setItem).toHaveBeenCalledWith(APP_SIDEBAR_WIDTH_STORAGE_KEY, "400");
    expect(dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: APP_SIDEBAR_WIDTH_STORAGE_EVENT }),
    );
  });
});
