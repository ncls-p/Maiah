"use client";

import { Link } from "@/i18n/navigation";
import {
  BracesIcon,
  CheckIcon,
  PlugIcon,
  RefreshCwIcon,
  Settings2Icon,
  ShieldCheckIcon,
  SparklesIcon,
  WrenchIcon,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import type { ChatAgent } from "@/components/chat/chat-types";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchJson } from "@/lib/api-client";
import { cn } from "@/lib/utils";

type ToolSource = "builtin" | "mcp" | "custom";

type EnabledToolSummary = {
  id: string;
  source: ToolSource;
  name: string;
  description: string | null;
  group: string | null;
  requireApproval: boolean;
};

type EnabledToolsPayload = {
  tools: EnabledToolSummary[];
};

type ToolGroup = {
  source: ToolSource;
  icon: LucideIcon;
  tools: EnabledToolSummary[];
};

const TOOL_GROUPS: Array<Pick<ToolGroup, "source" | "icon">> = [
  { source: "builtin", icon: BracesIcon },
  { source: "mcp", icon: PlugIcon },
  { source: "custom", icon: WrenchIcon },
];

export function ChatToolsMenu({
  agent,
  workspaceId,
}: {
  agent: ChatAgent;
  workspaceId: string | null;
}) {
  const t = useTranslations("chat");
  const [open, setOpen] = useState(false);
  const [tools, setTools] = useState<EnabledToolSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const loadTools = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    setLoadError(false);

    try {
      const payload = await fetchJson<EnabledToolsPayload>(
        `/api/workspace/agents/${agent.id}/tools?workspaceId=${workspaceId}&includeDetails=true`,
      );
      setTools(payload.tools);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [agent.id, workspaceId]);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) void loadTools();
  }

  const groups = useMemo(
    () =>
      TOOL_GROUPS.map(({ source, icon }) => ({
        source,
        icon,
        tools: tools
          .filter((tool) => tool.source === source)
          .sort((a, b) => a.name.localeCompare(b.name)),
      })).filter((group) => group.tools.length > 0),
    [tools],
  );

  const activeCount = tools.length || agent.toolCount || 0;
  const groupLabel = (source: ToolSource) => {
    if (source === "builtin") return t("toolsMenu.groups.builtin");
    if (source === "mcp") return t("toolsMenu.groups.mcp");
    return t("toolsMenu.groups.custom");
  };

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="hidden min-h-9 shrink-0 gap-1.5 rounded-xl border-primary/15 bg-primary/6 px-2.5 text-[0.7rem] font-normal text-primary transition-[background-color,border-color,color,box-shadow,scale] hover:border-primary/25 hover:bg-primary/10 active:scale-[0.96] sm:inline-flex"
          aria-label={t("enabledTools", {
            count: agent.toolCount ?? activeCount,
          })}
        >
          <SparklesIcon className="size-3.5" aria-hidden="true" />
          <span>{t("toolsMenu.trigger")}</span>
          <span className="grid size-5 place-items-center rounded-md bg-primary/10 font-mono text-[0.6rem] tabular-nums">
            {agent.toolCount ?? activeCount}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="top"
        align="start"
        sideOffset={12}
        className="w-[min(23rem,calc(100vw-1.5rem))] overflow-hidden rounded-[1.125rem] p-0"
      >
        <div className="px-4 pb-3 pt-4">
          <p className="font-mono text-[0.6rem] font-medium uppercase tracking-[0.16em] text-primary">
            {t("toolsMenu.kicker")}
          </p>
          <h2 className="mt-1.5 text-sm font-semibold tracking-[-0.02em]">
            {t("toolsMenu.title")}
          </h2>
          <p className="mt-1.5 max-w-[19rem] text-xs leading-relaxed text-muted-foreground text-pretty">
            {t("toolsMenu.description")}
          </p>
        </div>

        <div className="max-h-72 overflow-y-auto border-y border-border/65 px-2 py-1.5">
          {loading ? (
            <div className="space-y-1 py-1">
              {Array.from({ length: 4 }, (_, index) => (
                <div
                  key={index}
                  className="flex items-center gap-3 rounded-xl px-2 py-2"
                >
                  <Skeleton className="size-9 shrink-0 rounded-xl" />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <Skeleton className="h-3 w-2/5" />
                    <Skeleton className="h-2.5 w-4/5" />
                  </div>
                  <Skeleton className="size-5 shrink-0 rounded-md" />
                </div>
              ))}
            </div>
          ) : loadError ? (
            <div className="flex min-h-36 flex-col items-center justify-center px-4 text-center">
              <p className="text-xs text-muted-foreground">
                {t("toolsMenu.loadError")}
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mt-2 min-h-10 rounded-xl"
                onClick={() => void loadTools()}
              >
                <RefreshCwIcon className="size-3.5" aria-hidden="true" />
                {t("toolsMenu.retry")}
              </Button>
            </div>
          ) : groups.length > 0 ? (
            groups.map(({ source, icon: GroupIcon, tools: groupTools }) => (
              <section key={source} className="py-1">
                <div className="flex items-center justify-between px-2 pb-1 pt-1">
                  <span className="text-[0.65rem] font-medium text-muted-foreground">
                    {groupLabel(source)}
                  </span>
                  <span className="font-mono text-[0.6rem] text-muted-foreground/70 tabular-nums">
                    {groupTools.length}
                  </span>
                </div>
                {groupTools.map((tool) => (
                  <div
                    key={`${tool.source}:${tool.id}`}
                    className="group/tool flex min-h-12 items-center gap-3 rounded-xl px-2 py-2 transition-[background-color] hover:bg-muted/65"
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/7 text-primary">
                      <GroupIcon className="size-4" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <strong className="block truncate text-xs font-medium">
                        {tool.name}
                      </strong>
                      <small className="mt-0.5 block truncate text-[0.65rem] text-muted-foreground">
                        {tool.group || tool.description || t("toolsMenu.ready")}
                      </small>
                    </span>
                    {tool.requireApproval ? (
                      <ShieldCheckIcon
                        className="size-4 shrink-0 text-amber-600 dark:text-amber-400"
                        aria-label={t("toolsMenu.approvalRequired")}
                      />
                    ) : (
                      <span
                        className="grid size-5 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground"
                        aria-label={t("toolsMenu.active")}
                      >
                        <CheckIcon className="size-3" aria-hidden="true" />
                      </span>
                    )}
                  </div>
                ))}
              </section>
            ))
          ) : (
            <div className="flex min-h-32 items-center justify-center px-6 text-center text-xs text-muted-foreground">
              {t("toolsMenu.empty")}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 px-3 py-3">
          <span className="pl-1 font-mono text-[0.65rem] text-muted-foreground">
            {t("toolsMenu.activeCount", { count: activeCount })}
          </span>
          <DropdownMenuItem
            asChild
            className={cn(
              "min-h-10 cursor-pointer bg-primary px-3 text-xs font-medium text-primary-foreground",
              "focus:bg-primary/90 focus:text-primary-foreground",
            )}
          >
            <Link href={`/agents/${agent.id}`} className="gap-2">
              <Settings2Icon className="size-3.5" aria-hidden="true" />
              {t("toolsMenu.customize")}
            </Link>
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
