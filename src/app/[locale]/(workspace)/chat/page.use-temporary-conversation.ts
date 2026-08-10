"use client";

import type { ChatConversation } from "@/components/chat/chat-types";
import { fetchJson } from "@/lib/api-client";
import { notifyWorkspaceHistoryChanged } from "@/lib/workspace-history-events";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Dispatch, SetStateAction } from "react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { upsertConversation } from "./chat-page-helpers";

export function useTemporaryConversationPersistence(input: { activeConversationId: string | null; setEphemeral: Dispatch<SetStateAction<boolean>>; setConversations: Dispatch<SetStateAction<ChatConversation[]>>; translate: (key: string) => string }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [converting, setConverting] = useState(false);

  const removeTemporaryRouteState = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("temporary");
    params.delete("ttl");
    router.replace(params.size > 0 ? `${pathname}?${params.toString()}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  const makePersistent = useCallback(async () => {
    if (converting) return;
    setConverting(true);
    try {
      if (input.activeConversationId) {
        const data = await fetchJson<{ conversation: ChatConversation }>(`/api/workspace/conversations/${input.activeConversationId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ makePersistent: true }) });
        input.setEphemeral(false);
        input.setConversations((current) => upsertConversation(current, { ...data.conversation, isEphemeral: false }));
        notifyWorkspaceHistoryChanged();
        removeTemporaryRouteState();
      } else {
        input.setEphemeral(false);
        removeTemporaryRouteState();
      }
      toast.success(input.translate("temporaryConverted"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : input.translate("temporaryConversionFailed"));
    } finally {
      setConverting(false);
    }
  }, [converting, input, removeTemporaryRouteState]);

  return { convertingTemporaryConversation: converting, makeConversationPersistent: makePersistent };
}
