"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ComponentType,
  type SVGProps,
} from "react";
import {
  BinaryIcon,
  BracesIcon,
  BriefcaseIcon,
  CalculatorIcon,
  CalendarIcon,
  ClockIcon,
  Code2Icon,
  DicesIcon,
  FileTextIcon,
  FingerprintIcon,
  GlobeIcon,
  HashIcon,
  LinkIcon,
  ListChecksIcon,
  MailIcon,
  PaletteIcon,
  PenLineIcon,
  PresentationIcon,
  SearchIcon,
  ShieldCheckIcon,
  TableIcon,
  WrenchIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { PageEmptyState } from "@/components/page-empty-state";
import { PageLoading } from "@/components/page-loading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import {
  type BuiltInToolSummary,
  type ToolRiskLevel,
} from "@/modules/tool/builtin-tools-catalog";

type BuiltInToolPolicy = BuiltInToolSummary & {
  enabled: boolean;
  requireApproval: boolean;
  configured: boolean;
};

const CATEGORY_ORDER = [
  "Think",
  "Time",
  "Web",
  "Create",
  "Work",
  "Data",
  "Code",
  "Write",
  "Design",
] as const;

type ToolCategory = (typeof CATEGORY_ORDER)[number];
type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

function GithubMarkIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M12 2C6.48 2 2 6.58 2 12.26c0 4.53 2.87 8.37 6.84 9.73.5.1.68-.22.68-.5l-.01-1.74c-2.78.62-3.37-1.37-3.37-1.37-.45-1.18-1.11-1.49-1.11-1.49-.91-.64.07-.63.07-.63 1 .07 1.53 1.06 1.53 1.06.9 1.57 2.35 1.12 2.92.86.09-.67.35-1.12.64-1.38-2.22-.26-4.56-1.14-4.56-5.08 0-1.12.39-2.04 1.03-2.76-.1-.26-.45-1.31.1-2.72 0 0 .85-.28 2.75 1.05A9.36 9.36 0 0 1 12 6.95c.85 0 1.7.12 2.5.34 1.9-1.33 2.74-1.05 2.74-1.05.55 1.41.2 2.46.1 2.72.64.72 1.03 1.64 1.03 2.76 0 3.95-2.34 4.81-4.57 5.07.36.32.68.95.68 1.92l-.01 2.85c0 .28.18.61.69.5A10.19 10.19 0 0 0 22 12.26C22 6.58 17.52 2 12 2Z" />
    </svg>
  );
}

const TOOL_ICONS: Record<string, IconComponent> = {
  calculator: CalculatorIcon,
  current_time: ClockIcon,
  http_fetch: GlobeIcon,
  web_search: SearchIcon,
  render_html_artifact: Code2Icon,
  run_code_sandbox: BracesIcon,
  code_workspace_create_project: Code2Icon,
  code_workspace_list_files: Code2Icon,
  code_workspace_read_file: Code2Icon,
  code_workspace_write_file: Code2Icon,
  code_workspace_replace_text: Code2Icon,
  code_workspace_delete_file: Code2Icon,
  github_get_publish_status: GithubMarkIcon,
  github_publish_code_workspace: GithubMarkIcon,
  create_slide_deck: PresentationIcon,
  create_business_document: FileTextIcon,
  create_spreadsheet: TableIcon,
  create_meeting_brief: CalendarIcon,
  create_action_plan: ListChecksIcon,
  create_decision_matrix: TableIcon,
  create_email_pack: MailIcon,
  create_project_status_report: ListChecksIcon,
  create_risk_register: ShieldCheckIcon,
  create_raci_matrix: TableIcon,
  create_customer_account_plan: BriefcaseIcon,
  create_competitive_battlecard: BriefcaseIcon,
  random_number: DicesIcon,
  uuid_generator: FingerprintIcon,
  date_math: CalendarIcon,
  json_tool: BracesIcon,
  text_stats: FileTextIcon,
  base64_tool: BinaryIcon,
  hash_text: HashIcon,
  unit_converter: CalculatorIcon,
  slugify_text: LinkIcon,
  color_converter: PaletteIcon,
  markdown_table: TableIcon,
};

const CATEGORY_STYLES: Record<ToolCategory, { icon: IconComponent }> = {
  Think: { icon: WrenchIcon },
  Time: { icon: ClockIcon },
  Web: { icon: GlobeIcon },
  Create: { icon: Code2Icon },
  Work: { icon: BriefcaseIcon },
  Data: { icon: TableIcon },
  Code: { icon: BracesIcon },
  Write: { icon: PenLineIcon },
  Design: { icon: PaletteIcon },
};

const TOOL_CATEGORY_VALUES = new Set<string>(CATEGORY_ORDER);

function isToolCategory(value: string): value is ToolCategory {
  const normalized = value.trim();
  return TOOL_CATEGORY_VALUES.has(normalized);
}

function riskBadgeVariant(riskLevel: ToolRiskLevel) {
  if (riskLevel === "high" || riskLevel === "critical") return "destructive";
  if (riskLevel === "medium") return "secondary";
  return "outline";
}

function RiskBadge({
  riskLevel,
  label,
}: {
  riskLevel: ToolRiskLevel;
  label: string;
}) {
  return (
    <Badge
      variant={riskBadgeVariant(riskLevel)}
      className="shrink-0 rounded-full px-2 text-[10px] font-medium"
    >
      {label}
    </Badge>
  );
}

function BuiltinToolCard({
  tool,
  riskLabel,
  approvalLabel,
  enabledLabel,
  disabledLabel,
  canManage,
  pending,
  onEnabledChange,
  onApprovalChange,
  categoryLabel,
}: {
  tool: BuiltInToolPolicy;
  riskLabel: string;
  approvalLabel: string;
  enabledLabel: string;
  disabledLabel: string;
  canManage: boolean;
  pending: boolean;
  onEnabledChange: (enabled: boolean) => void;
  onApprovalChange: (requireApproval: boolean) => void;
  categoryLabel: string;
}) {
  const ToolIcon = TOOL_ICONS[tool.name] ?? WrenchIcon;

  return (
    <article
      className={cn(
        "group flex min-h-full flex-col rounded-2xl border bg-card p-4 transition-colors duration-150 hover:border-input hover:bg-muted/30",
        !tool.enabled && "bg-muted/20",
      )}
    >
      <div className="flex items-start gap-3.5">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl border bg-background text-muted-foreground">
          <ToolIcon className="size-4" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="mb-1 text-[0.64rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {categoryLabel}
              </p>
              <h4 className="truncate text-sm font-semibold leading-tight tracking-[-0.015em] text-foreground">
                {tool.displayName}
              </h4>
            </div>
            <RiskBadge riskLevel={tool.riskLevel} label={riskLabel} />
          </div>
          <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
            {tool.description}
          </p>
          <div className="mt-3 flex items-center justify-between gap-3">
            <code className="truncate text-[0.68rem] text-muted-foreground">
              {tool.name}
            </code>
            <Badge variant={tool.enabled ? "secondary" : "outline"}>
              {tool.enabled ? enabledLabel : disabledLabel}
            </Badge>
          </div>
        </div>
      </div>
      <div className="mt-auto grid gap-2 border-t pt-3 sm:grid-cols-2">
        <label className="flex min-h-10 items-center justify-between gap-3 rounded-xl bg-muted/30 px-3 py-2 text-xs font-medium">
          <span>{enabledLabel}</span>
          <Switch
            checked={tool.enabled}
            disabled={!canManage || pending}
            onCheckedChange={onEnabledChange}
            aria-label={`${enabledLabel} — ${tool.displayName}`}
          />
        </label>
        <label className="flex min-h-10 items-center justify-between gap-3 rounded-xl bg-muted/30 px-3 py-2 text-xs font-medium">
          <span className="flex items-center gap-1.5">
            <ShieldCheckIcon
              className="size-3.5 text-muted-foreground"
              aria-hidden="true"
            />
            {approvalLabel}
          </span>
          <Switch
            checked={tool.requireApproval}
            disabled={!canManage || pending}
            onCheckedChange={onApprovalChange}
            aria-label={`${approvalLabel} — ${tool.displayName}`}
          />
        </label>
      </div>
    </article>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "default" | "low" | "medium" | "high";
}) {
  const toneClass =
    tone === "high"
      ? "text-destructive"
      : tone === "medium"
        ? "text-amber-700 dark:text-amber-300"
        : tone === "low"
          ? "text-emerald-700 dark:text-emerald-300"
          : "text-foreground";

  return (
    <div className="rounded-2xl border bg-card px-3.5 py-3">
      <p className="text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 text-2xl font-semibold tabular-nums leading-none tracking-[-0.04em]",
          toneClass,
        )}
      >
        {value}
      </p>
    </div>
  );
}

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

  const groupedTools = useMemo(() => {
    if (categoryFilter !== "all") {
      return [{ category: categoryFilter, tools: filteredTools }];
    }
    const groups = new Map<string, BuiltInToolPolicy[]>();
    for (const tool of filteredTools) {
      const list = groups.get(tool.category) ?? [];
      list.push(tool);
      groups.set(tool.category, list);
    }
    return CATEGORY_ORDER.filter((category) => groups.has(category)).map(
      (category) => ({
        category,
        tools: groups.get(category) ?? [],
      }),
    );
  }, [filteredTools, categoryFilter]);

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
      <section className="rounded-2xl border bg-card p-5 sm:p-6">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-end">
          <div className="flex max-w-2xl flex-col gap-3">
            <div className="inline-flex w-fit items-center gap-2 rounded-full border bg-background px-3 py-1 text-muted-foreground">
              <WrenchIcon className="size-3.5" aria-hidden="true" />
              <p className="text-[0.66rem] font-semibold uppercase tracking-[0.18em]">
                {t("eyebrow")}
              </p>
            </div>
            <h2 className="max-w-xl text-2xl font-semibold tracking-[-0.045em] text-foreground sm:text-3xl">
              {t("title")}
            </h2>
            <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
              {t("description")}
            </p>
            <p className="max-w-xl text-xs leading-relaxed text-muted-foreground">
              {canManage ? t("adminHint") : t("readOnlyHint")}
            </p>
            <Button variant="outline" size="sm" className="mt-1 w-fit" asChild>
              <Link href="/agents">{t("enableCta")}</Link>
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <StatCard label={t("stats.total")} value={stats.total} />
            <StatCard
              label={t("stats.enabled")}
              value={stats.enabled}
              tone="low"
            />
            <StatCard
              label={t("stats.approval")}
              value={stats.approval}
              tone="medium"
            />
            <StatCard
              label={t("stats.disabled")}
              value={stats.disabled}
              tone="high"
            />
          </div>
        </div>
      </section>

      <section className="rounded-2xl border bg-card p-3.5 sm:p-4">
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
          <p className="shrink-0 px-1 text-xs text-muted-foreground lg:text-right">
            {t("resultsCount", { count: filteredTools.length })}
          </p>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant={categoryFilter === "all" ? "default" : "outline"}
            className="h-8 rounded-full px-3 text-xs"
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
                  "h-8 gap-1.5 rounded-full border px-3 text-xs",
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
        <div className="flex flex-col gap-7">
          {groupedTools.map((group) => {
            const CategoryIcon = isToolCategory(group.category)
              ? CATEGORY_STYLES[group.category].icon
              : CATEGORY_STYLES.Think.icon;
            const showHeader = categoryFilter === "all";
            const label = categoryLabel(group.category);

            return (
              <section key={group.category} className="flex flex-col gap-3">
                {showHeader ? (
                  <div className="flex items-center gap-2.5 px-1">
                    <div className="flex size-7 items-center justify-center rounded-xl border bg-background text-muted-foreground">
                      <CategoryIcon className="size-3.5" aria-hidden="true" />
                    </div>
                    <h3 className="text-sm font-semibold tracking-[-0.02em] text-foreground">
                      {label}
                    </h3>
                    <span className="rounded-full bg-muted/42 px-2 py-0.5 text-[0.68rem] text-muted-foreground">
                      {group.tools.length}
                    </span>
                  </div>
                ) : null}
                <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {group.tools.map((tool) => (
                    <li key={tool.id}>
                      <BuiltinToolCard
                        tool={tool}
                        riskLabel={riskLabels[tool.riskLevel]}
                        approvalLabel={t("approval")}
                        enabledLabel={t("enabled")}
                        disabledLabel={t("disabled")}
                        canManage={canManage}
                        pending={pendingToolNames.has(tool.name)}
                        onEnabledChange={(enabled) =>
                          void updatePolicy(tool, { enabled })
                        }
                        onApprovalChange={(requireApproval) =>
                          void updatePolicy(tool, { requireApproval })
                        }
                        categoryLabel={label}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
