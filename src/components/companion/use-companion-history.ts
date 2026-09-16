"use client";
import { useEffect, useRef, useState } from "react";
import { fetchJson } from "@/lib/api-client";
import type { ChatMessage } from "@/components/chat/chat-types";
import type { useChatStream } from "@/hooks/use-chat-stream";
export function useCompanionHistory({
  stream,
  storageKey,
  onRestore,
  onLoaded,
  onError,
}: {
  stream: ReturnType<typeof useChatStream>;
  storageKey: string;
  onRestore: (id: string | null) => void;
  onLoaded: (loaded: boolean) => void;
  onError: (message: string) => void;
}) {
  const [revision, setRevision] = useState(0);
  const streamRef = useRef(stream);
  useEffect(() => {
    streamRef.current = stream;
  }, [stream]);
  useEffect(() => {
    const controller = new AbortController();
    const restore = async () => {
      onError("");
      let id: string | null = null;
      try {
        id = localStorage.getItem(storageKey);
      } catch {}
      if (id) {
        try {
          const data = await fetchJson<{ messages: ChatMessage[] }>(
            `/api/workspace/conversations/${id}`,
            { signal: controller.signal },
          );
          if (controller.signal.aborted) return;
          onRestore(id);
          streamRef.current.setMessages(data.messages);
        } catch (error) {
          if (controller.signal.aborted) return;
          onError(error instanceof Error ? error.message : String(error));
          if (
            !(error instanceof Error) ||
            !/HTTP (403|404)\b/.test(error.message)
          )
            return;
          onRestore(null);
          try {
            localStorage.removeItem(storageKey);
          } catch {}
        }
      }
      if (!controller.signal.aborted) onLoaded(true);
    };
    void restore();
    return () => controller.abort();
  }, [storageKey, onRestore, onLoaded, onError, revision]);
  useEffect(
    () => () => {
      void streamRef.current.stopGeneration();
    },
    [],
  );
  return () => setRevision((value) => value + 1);
}
