"use client";
import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { fetchJson } from "@/lib/api-client";
import type { CompanionCommand } from "@/modules/companion/contracts";
import { applyUiAction, capturePage } from "./page-context";
export function usePageBridge(
  workspaceId: string,
  contextId: string,
  active: boolean,
  onError: (message: string) => void,
) {
  const router = useRouter();
  const cursor = useRef<{ x: number; y: number } | null>(null);
  const running = useRef(false);
  const activeRef = useRef(active);
  useEffect(() => {
    activeRef.current = active;
  }, [active]);
  const errorRef = useRef(onError);
  useEffect(() => {
    errorRef.current = onError;
  }, [onError]);
  useEffect(() => {
    const move = (event: PointerEvent) => {
      if (!(event.target as Element)?.closest("[data-companion-root]"))
        cursor.current = { x: event.clientX, y: event.clientY };
    };
    window.addEventListener("pointermove", move, { passive: true });
    return () => window.removeEventListener("pointermove", move);
  }, []);
  const poll = useCallback(
    async (capture = true) => {
      if (running.current) return;
      running.current = true;
      try {
        const result = await fetchJson<{ commands: CompanionCommand[] }>(
          "/api/companion/context",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              workspaceId,
              contextId,
              page: capture ? capturePage(cursor.current) : null,
            }),
          },
        );
        for (const command of result.commands) {
          let response: { ok: boolean; error?: string } = { ok: true };
          try {
            if (!activeRef.current)
              throw new Error("Page interaction is paused");
            await applyUiAction(
              command.action,
              (path) => router.push(path),
              () => {
                window.dispatchEvent(new Event("maiah:refresh-page"));
                router.refresh();
              },
            );
          } catch (error) {
            response = {
              ok: false,
              error:
                error instanceof Error
                  ? error.message
                  : "Browser action failed",
            };
          }
          await fetchJson("/api/companion/context", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              workspaceId,
              contextId,
              id: command.id,
              result: response,
            }),
          });
        }
      } finally {
        running.current = false;
      }
    },
    [workspaceId, contextId, router],
  );
  useEffect(() => {
    if (!active) {
      void poll(false).catch(() => {});
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        await poll();
      } catch (error) {
        if (!cancelled)
          errorRef.current(
            error instanceof Error ? error.message : "Page context unavailable",
          );
      }
      if (!cancelled) timer = setTimeout(() => void tick(), 900);
    };
    void tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      void poll(false).catch(() => {});
    };
  }, [active, poll]);
  return poll;
}
