"use client";
import {
  useEffect,
  useState,
  type PointerEvent,
  type KeyboardEvent,
} from "react";
const key = "maiah:companion-position";
export function useCompanionPosition(open: boolean) {
  const [position, setPosition] = useState<{ x: number; y: number } | null>(
    null,
  );
  const bound = (point: { x: number; y: number }) => ({
    x: Math.max(
      8,
      Math.min(
        point.x,
        innerWidth - Math.min(open ? 440 : 104, innerWidth - 16) - 8,
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
    if (event.button !== 0) return;
    const element = event.currentTarget;
    const box = element
      .closest("[data-companion-root]")!
      .getBoundingClientRect();
    const start = { x: event.clientX, y: event.clientY };
    element.setPointerCapture(event.pointerId);
    const move = (next: globalThis.PointerEvent) =>
      save({
        x: box.left + next.clientX - start.x,
        y: box.top + next.clientY - start.y,
      });
    const end = () => {
      element.removeEventListener("pointermove", move);
      element.removeEventListener("pointerup", end);
      element.removeEventListener("pointercancel", end);
    };
    element.addEventListener("pointermove", move);
    element.addEventListener("pointerup", end);
    element.addEventListener("pointercancel", end);
  }
  function keyDown(event: KeyboardEvent<HTMLElement>) {
    if (!event.key.startsWith("Arrow")) return;
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
