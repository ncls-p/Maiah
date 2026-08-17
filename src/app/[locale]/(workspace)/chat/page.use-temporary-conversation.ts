"use client";

import type { ChatConversation } from "@/components/chat/chat-types";
import { fetchJson } from "@/lib/api-client";
import { notifyWorkspaceHistoryChanged } from "@/lib/workspace-history-events";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Dispatch, SetStateAction } from "react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { upsertConversation } from "./chat-page-helpers";

export function useTemporaryConversationPersistence(input: {
  workspaceId: string | null | undefined;
  activeConversationId: string | null;
  setEphemeral: Dispatch<SetStateAction<boolean>>;
  setEphemeralTtlMinutes: Dispatch<SetStateAction<number>>;
  setEphemeralExpiresAt: Dispatch<SetStateAction<string | null>>;
  setConversations: Dispatch<SetStateAction<ChatConversation[]>>;
  translate: (key: string) => string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [converting, setConverting] = useState(false);
  const [updatingRetention, setUpdatingRetention] = useState(false);

  const removeTemporaryRouteState = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("temporary");
    params.delete("ttl");
    router.replace(
      params.size > 0 ? `${pathname}?${params.toString()}` : pathname,
      { scroll: false },
    );
  }, [pathname, router, searchParams]);

  const updateTemporaryRouteTtl = useCallback(
    (ttlMinutes: number) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("temporary", "true");
      params.set("ttl", String(ttlMinutes));
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const makePersistent = useCallback(async () => {
    if (converting) return;
    setConverting(true);
    try {
      if (input.activeConversationId) {
        const data = await fetchJson<{ conversation: ChatConversation }>(
          `/api/workspace/conversations/${input.activeConversationId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ makePersistent: true }),
          },
        );
        input.setEphemeral(false);
        input.setEphemeralExpiresAt(null);
        input.setConversations((current) =>
          upsertConversation(current, {
            ...data.conversation,
            isEphemeral: false,
          }),
        );
        notifyWorkspaceHistoryChanged(input.workspaceId ?? null);
        removeTemporaryRouteState();
      } else {
        input.setEphemeral(false);
        input.setEphemeralExpiresAt(null);
        removeTemporaryRouteState();
      }
      toast.success(input.translate("persistentIndicator"), {
        description: input.translate("persistentDescription"),
        duration: 2_000,
      });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : input.translate("temporaryConversionFailed"),
      );
    } finally {
      setConverting(false);
    }
  }, [converting, input, removeTemporaryRouteState]);

  const extendRetention = useCallback(
    async (ttlMinutes: number) => {
      if (!input.activeConversationId || updatingRetention) return;
      setUpdatingRetention(true);
      try {
        const data = await fetchJson<{ conversation: ChatConversation }>(
          `/api/workspace/conversations/${input.activeConversationId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ephemeralTtlMinutes: ttlMinutes }),
          },
        );
        const updatedTtlMinutes =
          data.conversation.ephemeralTtlMinutes ?? ttlMinutes;
        input.setEphemeralTtlMinutes(updatedTtlMinutes);
        input.setEphemeralExpiresAt(data.conversation.expiresAt ?? null);
        notifyWorkspaceHistoryChanged(input.workspaceId ?? null);
        updateTemporaryRouteTtl(updatedTtlMinutes);
        toast.success(input.translate("temporaryExtended"));
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : input.translate("temporaryExtensionFailed"),
        );
      } finally {
        setUpdatingRetention(false);
      }
    },
    [input, updateTemporaryRouteTtl, updatingRetention],
  );

  return {
    convertingTemporaryConversation: converting,
    extendingTemporaryConversation: updatingRetention,
    extendTemporaryConversation: extendRetention,
    makeConversationPersistent: makePersistent,
  };
}
