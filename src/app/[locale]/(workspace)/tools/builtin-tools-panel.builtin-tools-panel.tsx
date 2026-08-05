"use client";

import {
SearchIcon
} from "lucide-react";
import { useTranslations } from "next-intl";
import {
useCallback,
useEffect,
useMemo,
useState
} from "react";
import { toast } from "sonner";

import { PageEmptyState } from "@/components/page-empty-state";
import { PageLoading } from "@/components/page-loading";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
type ToolRiskLevel
} from "@/modules/tool/builtin-tools-catalog";
import { BuiltInToolPolicy,CATEGORY_ORDER,CATEGORY_STYLES,isToolCategory } from "./builtin-tools-panel.built-in-tool-policy";
import { BuiltinToolCard } from "./builtin-tools-panel.builtin-tool-card";


export function BuiltinToolsPanel({
  workspaceId,
  canManage,
}: {
  workspaceId: string;
  canManage: boolean;
}) {
  const t = useTranslations("tools.builtin");
  const [builtinTools, setBuiltinTools] = useState<BuiltInToolPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [pendingToolNames, setPendingToolNames] = useState<Set<string>>(
    new Set(),
  );
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const loadTools = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const response = await fetch(
        `/api/workspace/tools?workspaceId=${workspaceId}`,
      );
      if (!response.ok) throw new Error("Unable to load built-in tools");
      setBuiltinTools((await response.json()) as BuiltInToolPolicy[]);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadTools(), 0);
    return () => window.clearTimeout(timeout);
  }, [loadTools]);

  async function updatePolicy(
    tool: BuiltInToolPolicy,
    patch: Pick<Partial<BuiltInToolPolicy>, "enabled" | "requireApproval">,
  ) {
    const previous = tool;
    setPendingToolNames((current) => new Set(current).add(tool.name));
    setBuiltinTools((current) =>
      current.map((candidate) =>
        candidate.name === tool.name ? { ...candidate, ...patch } : candidate,
      ),
    );
    try {
      const response = await fetch("/api/workspace/tools", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, toolName: tool.name, ...patch }),
      });
      if (!response.ok) throw new Error("Unable to update built-in tool");
      const updated = (await response.json()) as BuiltInToolPolicy;
      setBuiltinTools((current) =>
        current.map((candidate) =>
          candidate.name === updated.name ? updated : candidate,
        ),
      );
      toast.success(t("updateSuccess", { name: tool.displayName }));
    } catch {
      setBuiltinTools((current) =>
        current.map((candidate) =>
          candidate.name === previous.name ? previous : candidate,
        ),
      );
      toast.error(t("updateFailed"));
    } finally {
      setPendingToolNames((current) => {
        const next = new Set(current);
        next.delete(tool.name);
        return next;
      });
    }
  }

  const riskLabels: Record<ToolRiskLevel, string> = {
    low: t("risk.low"),
    medium: t("risk.medium"),
    high: t("risk.high"),
    critical: t("risk.critical"),
  };

  const stats = useMemo(() => {
    return {
      total: builtinTools.length,
      enabled: builtinTools.filter((tool) => tool.enabled).length,
      approval: builtinTools.filter(
        (tool) => tool.enabled && tool.requireApproval,
      ).length,
      disabled: builtinTools.filter((tool) => !tool.enabled).length,
    };
  }, [builtinTools]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const tool of builtinTools) set.add(tool.category);
    return CATEGORY_ORDER.filter((category) => set.has(category));
  }, [builtinTools]);

  const filteredTools = useMemo(() => {
    const query = search.trim().toLowerCase();
    return builtinTools.filter((tool) => {
      if (categoryFilter !== "all" && tool.category !== categoryFilter) {
        return false;
      }
      if (!query) return true;
      return (
        tool.displayName.toLowerCase().includes(query) ||
        tool.name.toLowerCase().includes(query) ||
        tool.description.toLowerCase().includes(query) ||
        tool.category.toLowerCase().includes(query)
      );
    });
  }, [builtinTools, search, categoryFilter]);

  function categoryLabel(category: string) {
    return isToolCategory(category) ? t(`categories.${category}`) : category;
  }

  if (loading) return <PageLoading label={t("loading")} />;

  if (loadError) {
    return (
      <div className="rounded-2xl border border-destructive/25 bg-destructive/5 p-5">
        <h2 className="text-base font-semibold">{t("loadFailed")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("loadFailedDescription")}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-4"
          onClick={() => void loadTools()}
        >
          {t("retry")}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 animate-in-fade">
      <section className="rounded-2xl border border-border/70 bg-card/55 p-2.5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative min-w-0 flex-1">
            <SearchIcon
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/70"
              aria-hidden="true"
            />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("searchPlaceholder")}
              className="h-10 pl-9"
              aria-label={t("searchPlaceholder")}
            />
          </div>
          <div className="flex shrink-0 items-center gap-1.5 text-[0.68rem] text-muted-foreground">
            <span className="rounded-full bg-success/10 px-2 py-1 text-success">
              {t("stats.enabled")} {stats.enabled}
            </span>
            <span className="rounded-full bg-muted px-2 py-1">
              {t("resultsCount", { count: filteredTools.length })}
            </span>
          </div>
        </div>
        <div className="mt-2 flex flex-nowrap gap-1.5 overflow-x-auto pb-0.5">
          <Button
            type="button"
            size="sm"
            variant={categoryFilter === "all" ? "default" : "outline"}
            className="h-8 shrink-0 rounded-full px-3 text-xs"
            onClick={() => setCategoryFilter("all")}
          >
            {t("allCategories")}
          </Button>
          {categories.map((category) => {
            const CategoryIcon = CATEGORY_STYLES[category].icon;
            const active = categoryFilter === category;
            return (
              <Button
                key={category}
                type="button"
                size="sm"
                variant="outline"
                className={cn(
                  "h-8 shrink-0 gap-1.5 rounded-full border px-3 text-xs",
                  active
                    ? "border-input bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
                onClick={() => setCategoryFilter(category)}
              >
                <CategoryIcon className="size-3.5" aria-hidden="true" />
                {categoryLabel(category)}
              </Button>
            );
          })}
        </div>
      </section>

      {filteredTools.length === 0 ? (
        <PageEmptyState
          icon={SearchIcon}
          title={t("noResults")}
          description={t("noResultsHint")}
        />
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {filteredTools.map((tool) => (
            <li key={tool.id}>
              <BuiltinToolCard
                tool={tool}
                riskLabel={riskLabels[tool.riskLevel]}
                approvalLabel={t("approval")}
                enabledLabel={t("enabled")}
                disabledLabel={t("disabled")}
                detailsLabel={t("details", {
                  name: tool.displayName,
                })}
                canManage={canManage}
                pending={pendingToolNames.has(tool.name)}
                onEnabledChange={(enabled) =>
                  void updatePolicy(tool, { enabled })
                }
                onApprovalChange={(requireApproval) =>
                  void updatePolicy(tool, { requireApproval })
                }
                categoryLabel={categoryLabel(tool.category)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
