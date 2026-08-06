"use client";

import { ChevronDownIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState,useSyncExternalStore } from "react";

import { Collapsible,CollapsibleContent,CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { type NavGroup } from "@/lib/workspace-nav";
import { BUTTON_TYPE,ChatNavLink,DEFAULT_WORKSPACE_NAV_OPEN,getStoredWorkspaceNavOpen,setStoredWorkspaceNavOpen,subscribeWorkspaceNavOpen } from "./chat-sidebar.default-workspace-nav-open";

export function ChatAppNavigation({ groups }: { groups: NavGroup[] }) {
  const tGroups = useTranslations("nav.groups");
  const t = useTranslations("chat.sidebar");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const workspaceOpen = useSyncExternalStore(subscribeWorkspaceNavOpen, getStoredWorkspaceNavOpen, () => DEFAULT_WORKSPACE_NAV_OPEN);
  const primaryItems = groups
    .filter((group) => group.labelKey !== "advanced")
    .flatMap((group) => group.items)
    .filter((item) => item.href !== "/chat")
    .slice(0, 6);
  const advancedItems = groups.find((group) => group.labelKey === "advanced")?.items.filter((item) => item.href !== "/chat");

  if (primaryItems.length === 0 && (!advancedItems || advancedItems.length === 0)) {
    return null;
  }

  return (
    <Collapsible open={workspaceOpen} onOpenChange={setStoredWorkspaceNavOpen} className="border-t border-sidebar-border/60 px-2 py-2">
      <CollapsibleTrigger asChild>
        <button type={BUTTON_TYPE} className="flex min-h-10 w-full items-center justify-between rounded-xl px-3 text-xs font-medium text-muted-foreground transition-[background-color,color] hover:bg-sidebar-accent/70 hover:text-sidebar-foreground">
          <span>{t("workspace")}</span>
          <ChevronDownIcon className={cn("size-3.5 transition-transform", workspaceOpen && "rotate-180")} aria-hidden="true" />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-1">
        <div className="flex flex-col gap-1">
          {primaryItems.map((item) => (
            <ChatNavLink key={item.href} item={item} />
          ))}
        </div>
        {advancedItems && advancedItems.length > 0 ? (
          <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
            <CollapsibleTrigger asChild>
              <button type={BUTTON_TYPE} className="mt-1 flex min-h-10 w-full items-center justify-between rounded-xl px-3 text-[13px] font-medium text-sidebar-foreground/75 transition-[background-color,color] hover:bg-sidebar-accent/70 hover:text-sidebar-foreground">
                <span>{tGroups("advanced")}</span>
                <ChevronDownIcon className={cn("size-3.5 transition-transform", advancedOpen && "rotate-180")} aria-hidden="true" />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-1 flex flex-col gap-1">
              {advancedItems.map((item) => (
                <ChatNavLink key={item.href} item={item} />
              ))}
            </CollapsibleContent>
          </Collapsible>
        ) : null}
      </CollapsibleContent>
    </Collapsible>
  );
}
