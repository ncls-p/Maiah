"use client";

import { useCallback, useRef, useState } from "react";

/**
 * Detects whether an element's text is visually cut off by `truncate` or
 * `line-clamp-*`, so tooltips can be shown only when text is actually hidden.
 */
export function useIsTextClamped<T extends HTMLElement>() {
  const [clamped, setClamped] = useState(false);
  const observerRef = useRef<ResizeObserver | null>(null);

  const ref = useCallback((element: T | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (!element) return;

    const measure = () => {
      setClamped(
        element.scrollWidth > element.clientWidth + 1 ||
          element.scrollHeight > element.clientHeight + 1,
      );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    observerRef.current = observer;
    measure();
  }, []);

  return { ref, clamped };
}
