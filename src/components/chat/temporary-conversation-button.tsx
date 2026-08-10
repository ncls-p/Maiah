"use client";

import { TimerIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { EPHEMERAL_TTL_OPTIONS } from "@/modules/chat/ephemeral-retention";

const LABEL_KEYS = {
  5: "ephemeralRetention5",
  720: "ephemeralRetention720",
  1440: "ephemeralRetention1440",
  2880: "ephemeralRetention2880",
  10080: "ephemeralRetention10080",
} as const;

export function TemporaryConversationButton({ onSelect, tooltipSide = "bottom" }: { onSelect: (ttlMinutes: number) => void; tooltipSide?: "right" | "bottom" }) {
  const t = useTranslations("chat");
  const sidebarT = useTranslations("chat.sidebar");
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button type="button" size="icon" variant="ghost" className="size-11 shrink-0 rounded-xl border border-sidebar-border/60 bg-card/45" aria-label={sidebarT("newTemporaryConversation")}>
              <TimerIcon className="size-4" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side={tooltipSide}>{sidebarT("newTemporaryConversation")}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="start">
        {EPHEMERAL_TTL_OPTIONS.map((ttlMinutes) => (
          <DropdownMenuItem key={ttlMinutes} onSelect={() => onSelect(ttlMinutes)}>
            {t(LABEL_KEYS[ttlMinutes])}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
