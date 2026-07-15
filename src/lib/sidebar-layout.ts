export const APP_SIDEBAR_WIDTH_STORAGE_KEY = "app-sidebar-width";
export const APP_SIDEBAR_WIDTH_STORAGE_EVENT = "app-sidebar-width-change";

export const DEFAULT_APP_SIDEBAR_WIDTH = 288;
export const MIN_APP_SIDEBAR_WIDTH = 240;
export const MAX_APP_SIDEBAR_WIDTH = 400;

const LEGACY_WIDTH_STORAGE_KEYS = [
  "chat-unified-sidebar-width",
  "workspace-sidebar-width",
] as const;

export function clampAppSidebarWidth(value: number) {
  return Math.min(
    MAX_APP_SIDEBAR_WIDTH,
    Math.max(MIN_APP_SIDEBAR_WIDTH, Math.round(value)),
  );
}

export function subscribeAppSidebarWidth(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(APP_SIDEBAR_WIDTH_STORAGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(APP_SIDEBAR_WIDTH_STORAGE_EVENT, callback);
  };
}

export function getStoredAppSidebarWidth(): number {
  const stored =
    window.localStorage.getItem(APP_SIDEBAR_WIDTH_STORAGE_KEY) ??
    LEGACY_WIDTH_STORAGE_KEYS.map((key) =>
      window.localStorage.getItem(key),
    ).find((value) => value !== null);
  const parsed = stored
    ? Number.parseInt(stored, 10)
    : DEFAULT_APP_SIDEBAR_WIDTH;
  return Number.isFinite(parsed)
    ? clampAppSidebarWidth(parsed)
    : DEFAULT_APP_SIDEBAR_WIDTH;
}

export function setStoredAppSidebarWidth(width: number) {
  window.localStorage.setItem(
    APP_SIDEBAR_WIDTH_STORAGE_KEY,
    String(clampAppSidebarWidth(width)),
  );
  window.dispatchEvent(new Event(APP_SIDEBAR_WIDTH_STORAGE_EVENT));
}
