"use client";
import { type KeyboardEvent, type PointerEvent } from "react";
import { useEffect, useState } from "react";

const key = "maiah:companion-position";
const dragThreshold = 5;

function isEditable(target: EventTarget | null) {
  return (
    target instanceof Element &&
    Boolean(target.closest("textarea, input, select, [contenteditable='true']"))
  );
}

export function useCompanionPosition(open: boolean) {
  const [position, setPosition] = useState<{ x: number; y: number } | null>(
    null,
  );
  const bound = (point: { x: number; y: number }) => ({
    x: Math.max(
      8,
      Math.min(
        point.x,
        innerWidth - Math.min(open ? 440 : 56, innerWidth - 16) - 8,
      ),
    ),
    y: Math.max(
      8,
      Math.min(
        point.y,
        innerHeight - Math.min(open ? 620 : 56, innerHeight - 16) - 8,
      ),
    ),
  });
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        const stored = JSON.parse(localStorage.getItem(key) ?? "null");
        if (stored && Number.isFinite(stored.x) && Number.isFinite(stored.y))
          setPosition(bound(stored));
      } catch {
        /* Use the default corner. */
      }
    });
    const resize = () => setPosition((point) => (point ? bound(point) : null));
    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
    };
    // Bounds follow the visible panel dimensions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  function save(point: { x: number; y: number }) {
    const next = bound(point);
    setPosition(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {}
  }
  function pointerDown(event: PointerEvent<HTMLElement>) {
    if (event.button !== 0 || isEditable(event.target)) return;
    const element = event.currentTarget;
    const box = element
      .closest("[data-companion-root]")!
      .getBoundingClientRect();
    const start = { x: event.clientX, y: event.clientY };
    let dragging = false;
    element.setPointerCapture(event.pointerId);
    const move = (next: globalThis.PointerEvent) => {
      const dx = next.clientX - start.x;
      const dy = next.clientY - start.y;
      if (!dragging && dx * dx + dy * dy < dragThreshold * dragThreshold)
        return;
      dragging = true;
      next.preventDefault();
      save({ x: box.left + dx, y: box.top + dy });
    };
    const end = () => {
      element.removeEventListener("pointermove", move);
      element.removeEventListener("pointerup", end);
      element.removeEventListener("pointercancel", end);
      if (!dragging) return;
      const suppress = (click: MouseEvent) => {
        click.preventDefault();
        click.stopPropagation();
      };
      element.addEventListener("click", suppress, {
        capture: true,
        once: true,
      });
    };
    element.addEventListener("pointermove", move);
    element.addEventListener("pointerup", end);
    element.addEventListener("pointercancel", end);
  }
  function keyDown(event: KeyboardEvent<HTMLElement>) {
    if (!event.key.startsWith("Arrow") || isEditable(event.target)) return;
    event.preventDefault();
    const box = event.currentTarget
      .closest("[data-companion-root]")!
      .getBoundingClientRect();
    save({
      x:
        box.left +
        (event.key === "ArrowRight" ? 24 : event.key === "ArrowLeft" ? -24 : 0),
      y:
        box.top +
        (event.key === "ArrowDown" ? 24 : event.key === "ArrowUp" ? -24 : 0),
    });
  }
  return {
    style: position
      ? { left: position.x, top: position.y }
      : { right: 16, bottom: 16 },
    pointerDown,
    keyDown,
  };
}
