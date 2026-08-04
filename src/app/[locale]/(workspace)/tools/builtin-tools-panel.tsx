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
  MoreHorizontalIcon,
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
  detailsLabel,
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
  detailsLabel: string;
  canManage: boolean;
  pending: boolean;
  onEnabledChange: (enabled: boolean) => void;
  onApprovalChange: (requireApproval: boolean) => void;
  categoryLabel: string;
}) {
  const ToolIcon = TOOL_ICONS[tool.name] ?? WrenchIcon;
  const [expanded, setExpanded] = useState(false);

  return (
    <article
      className={cn(
        "group overflow-hidden rounded-2xl border border-border/70 bg-card/72 transition-[border-color,background-color,transform] duration-200 hover:-translate-y-0.5 hover:border-primary/20 hover:bg-card",
        !tool.enabled && "bg-muted/18",
      )}
    >
      <div className="flex min-h-[4.5rem] items-center gap-3 p-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/8 text-primary">
          <ToolIcon className="size-4" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="truncate text-sm font-semibold tracking-[-0.015em] text-foreground">
            {tool.displayName}
          </h4>
          <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
            {tool.description}
          </p>
        </div>
        <Switch
          checked={tool.enabled}
          disabled={!canManage || pending}
          onCheckedChange={onEnabledChange}
          aria-label={`${enabledLabel} — ${tool.displayName}`}
        />
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          className="rounded-lg text-muted-foreground"
          aria-label={detailsLabel}
          aria-expanded={expanded}
          onClick={() => setExpanded((current) => !current)}
        >
          <MoreHorizontalIcon className="size-4" aria-hidden="true" />
        </Button>
      </div>
      {expanded ? (
        <div className="grid gap-3 border-t border-border/60 bg-muted/18 px-3 py-3 animate-in-fade sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {categoryLabel}
              </span>
              <RiskBadge riskLevel={tool.riskLevel} label={riskLabel} />
              <Badge
                variant={tool.enabled ? "secondary" : "outline"}
                className="rounded-full text-[0.62rem]"
              >
                {tool.enabled ? enabledLabel : disabledLabel}
              </Badge>
            </div>
            <code className="mt-2 block truncate text-[0.68rem] text-muted-foreground">
              {tool.name}
            </code>
          </div>
          <label className="flex min-h-10 items-center justify-between gap-3 rounded-xl border border-border/60 bg-background/60 px-3 py-2 text-xs font-medium">
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
      ) : null}
    </article>
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
