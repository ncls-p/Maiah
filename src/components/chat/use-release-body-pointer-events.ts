"use client";

import { useEffect } from "react";

/**
 * Radix layers (dialog, dropdown, select) set `pointer-events: none` on the
 * body while they are open and restore it on close. When two layers close in
 * the same tick (a dialog opened from a button that overlaps a dropdown, a
 * select inside a dialog closed by Escape, ...), the restored value can be the
 * stale `none`, leaving the page unclickable. This releases the body once the
 * given layer has finished closing and no other layer is still open.
 */
export function useReleaseBodyPointerEvents(open: boolean) {
  useEffect(() => {
    if (open || typeof document === "undefined") return;
    const timer = window.setTimeout(() => {
      if (document.body.style.pointerEvents !== "none") return;
      const openLayer = document.querySelector(
        '[data-state="open"][role="dialog"], [data-state="open"][role="menu"], [data-state="open"][role="listbox"]',
      );
      if (openLayer) return;
      document.body.style.pointerEvents = "";
    }, 250);
    return () => window.clearTimeout(timer);
  }, [open]);
}
