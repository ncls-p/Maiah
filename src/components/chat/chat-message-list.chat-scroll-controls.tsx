"use client";

import { ChevronDownIcon, CircleDotDashedIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Marker, MarkerContent, MarkerIcon } from "@/components/ui/marker";
import {
  MessageScrollerButton,
  useMessageScroller,
  useMessageScrollerScrollable,
} from "@/components/ui/message-scroller";

export function ChatScrollControls({
  sending,
  onJumpLatest,
}: {
  sending: boolean;
  onJumpLatest?: () => Promise<void> | void;
}) {
  const t = useTranslations("chat.messageList");
  const scrollable = useMessageScrollerScrollable();
  const { scrollToEnd } = useMessageScroller();

  async function jumpToActualLatest() {
    const url = new URL(window.location.href);
    url.hash = "";
    window.history.replaceState(null, "", url);
    try {
      await onJumpLatest?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("jumpLatest"));
    }

    let remainingLayoutPasses = 5;
    const settleAtEnd = () => {
      scrollToEnd({ behavior: "auto" });
      remainingLayoutPasses -= 1;
      if (remainingLayoutPasses > 0) {
        window.requestAnimationFrame(settleAtEnd);
      }
    };
    window.requestAnimationFrame(settleAtEnd);
  }

  return (
    <>
      {sending && scrollable.end ? (
        <div className="pointer-events-none absolute inset-x-3 bottom-16 z-10 flex justify-center">
          <Marker className="w-fit rounded-full border bg-background/95 px-3 py-1.5 shadow-sm backdrop-blur">
            <MarkerIcon>
              <CircleDotDashedIcon data-icon="inline-start" />
            </MarkerIcon>
            <MarkerContent>{t("streamingBelow")}</MarkerContent>
          </Marker>
        </div>
      ) : null}
      <MessageScrollerButton
        direction="end"
        variant="secondary"
        size="sm"
        className="z-20 rounded-full px-3 shadow-sm"
        onClick={(event) => {
          event.preventDefault();
          void jumpToActualLatest();
        }}
      >
        <ChevronDownIcon data-icon="inline-start" />
        {t("jumpLatest")}
      </MessageScrollerButton>
    </>
  );
}
