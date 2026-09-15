"use client";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { fetchJson } from "@/lib/api-client";
import type { GenesysChatState } from "@/modules/genesys/contracts";
export function useGenesysHandoff(
  conversationId: string | null,
  owner: boolean,
  reload: () => unknown,
) {
  const t = useTranslations("genesys");
  const [snapshot, setSnapshot] = useState<{
    id: string;
    value: GenesysChatState;
  } | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const reloadRef = useRef(reload);
  const busyRef = useRef(false);
  const messageAttempt = useRef<{
    text: string;
    id: string;
    conversationId: string;
  } | null>(null);
  const versionRef = useRef("");
  const scopeRef = useRef(conversationId);
  useEffect(() => {
    scopeRef.current = conversationId;
  }, [conversationId]);
  useEffect(() => {
    reloadRef.current = reload;
  }, [reload]);
  const state = snapshot?.id === conversationId ? snapshot.value : null;
  useEffect(() => {
    if (!conversationId || !owner) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const value = await fetchJson<GenesysChatState>(
          `/api/workspace/conversations/${conversationId}/handoff`,
          { signal: controller.signal },
        );
        if (controller.signal.aborted) return;
        setSnapshot({ id: conversationId!, value });
        setError((current) =>
          current.startsWith(t("statusError")) ? "" : current,
        );
        const version = `${conversationId}:${value.session?.updatedAt ?? "ai"}`;
        if (versionRef.current && versionRef.current !== version)
          void reloadRef.current();
        versionRef.current = version;
      } catch (cause) {
        if (!controller.signal.aborted)
          setError(
            `${t("statusError")}\n${cause instanceof Error ? cause.message : ""}`,
          );
      } finally {
        if (!controller.signal.aborted)
          timer = setTimeout(() => void poll(), 3000);
      }
    }
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [conversationId, owner, t]);
  async function mutate(body: unknown) {
    if (!conversationId || !owner || busyRef.current) return false;
    busyRef.current = true;
    setPending(true);
    setError("");
    try {
      await fetchJson(
        `/api/workspace/conversations/${conversationId}/handoff`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const value = await fetchJson<GenesysChatState>(
        `/api/workspace/conversations/${conversationId}/handoff`,
      );
      if (scopeRef.current !== conversationId) return false;
      setSnapshot({ id: conversationId, value });
      void reloadRef.current();
      return true;
    } catch (cause) {
      setError(
        `${t("actionError")}\n${cause instanceof Error ? cause.message : ""}`,
      );
      return false;
    } finally {
      busyRef.current = false;
      setPending(false);
    }
  }
  async function send(text: string) {
    if (!conversationId) return false;
    if (
      !messageAttempt.current ||
      messageAttempt.current.text !== text ||
      messageAttempt.current.conversationId !== conversationId
    )
      messageAttempt.current = {
        text,
        conversationId,
        id: crypto.randomUUID(),
      };
    const ok = await mutate({
      action: "message",
      text,
      messageId: messageAttempt.current.id,
    });
    if (ok) messageAttempt.current = null;
    return ok;
  }
  return {
    state: owner ? state : null,
    pending: owner && pending,
    error: owner ? error : "",
    t,
    blocking:
      owner && (Boolean(state?.session) || Boolean(conversationId && !state)),
    canSend: Boolean(
      owner &&
      state?.session &&
      ["requested", "waiting", "human"].includes(state.session.state),
    ),
    send,
    mutate,
  };
}
