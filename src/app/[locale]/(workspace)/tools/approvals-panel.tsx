"use client";

import { Link } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  CheckCircle2,
  Clock,
  Loader2,
  MessageSquare,
  Shield,
  XCircle,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import { PageLoading } from "@/components/page-loading";
import { summarizeToolInput } from "@/components/chat/tool-approval-banner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/hooks/use-workspace";

// ── Types ──

interface ToolInvocation {
  id: string;
  conversationId: string | null;
  messageId: string | null;
  toolSource: string;
  toolId: string;
  toolName: string;
  input: unknown;
  riskLevel: string | null;
  status: string;
  latencyMs: number | null;
  errorMessage: string | null;
  approvedByUserId: string | null;
  createdAt: string;
  completedAt: string | null;
}

type ToolAction = "approve" | "reject";
type BusyInvocation = { id: string; action: ToolAction } | null;

// ── Constants ──

const HISTORY_STATUSES = new Set(["success", "failed", "rejected", "denied"]);

// ── Helpers ──

function isPendingApproval(invocation: ToolInvocation) {
  return (
    invocation.status === "awaiting_approval" ||
    invocation.status === "pending_approval"
  );
}

function getStatusLabel(status: string) {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function getToolDisplayName(toolName: string) {
  return getStatusLabel(toolName);
}

function getStatusColor(status: string) {
  switch (status) {
    case "success":
      return "text-success";
    case "awaiting_approval":
    case "pending_approval":
      return "text-warning";
    case "failed":
    case "rejected":
    case "denied":
      return "text-destructive";
    default:
      return "text-muted-foreground";
  }
}

function getStatusBg(status: string) {
  switch (status) {
    case "success":
      return "bg-success/10";
    case "awaiting_approval":
    case "pending_approval":
      return "bg-warning/10";
    case "failed":
    case "rejected":
    case "denied":
      return "bg-destructive/10";
    default:
      return "bg-muted";
  }
}

function getStatusRing(status: string) {
  switch (status) {
    case "success":
      return "ring-success/20";
    case "awaiting_approval":
    case "pending_approval":
      return "ring-warning/20";
    case "failed":
    case "rejected":
    case "denied":
      return "ring-destructive/20";
    default:
      return "ring-border";
  }
}

// ── Status Dot ──

function StatusDot({ status, animate }: { status: string; animate?: boolean }) {
  const isPending =
    status === "awaiting_approval" || status === "pending_approval";
  return (
    <span className="relative flex size-3">
      {isPending && animate && (
        <span
          className={cn(
            "absolute inset-0 rounded-full animate-ping opacity-40",
            getStatusColor(status),
          )}
          style={{
            backgroundColor: "currentColor",
          }}
        />
      )}
      <span
        className={cn(
          "relative size-3 rounded-full ring-2",
          getStatusColor(status),
          getStatusRing(status),
          getStatusBg(status),
        )}
      />
    </span>
  );
}

// ── Risk Badge ──

function RiskBadge({ riskLevel }: { riskLevel: string | null }) {
  const t = useTranslations("tools.approvals.risk");
  if (!riskLevel) return null;
  const config =
    riskLevel === "high" || riskLevel === "critical"
      ? {
          variant: "destructive" as const,
          label: riskLevel === "critical" ? t("critical") : t("high"),
        }
      : riskLevel === "medium"
        ? {
            variant: "outline" as const,
            label: t("medium"),
          }
        : { variant: "secondary" as const, label: t("low") };

  return <Badge variant={config.variant}>{config.label}</Badge>;
}

// ── Invocation Actions ──

function InvocationActions({
  invocationId,
  busyAction,
  onApprove,
  onReject,
}: {
  invocationId: string;
  busyAction: ToolAction | null;
  onApprove: (invocationId: string) => void;
  onReject: (invocationId: string) => void;
}) {
  const t = useTranslations("tools.approvals");
  const isBusy = busyAction !== null;

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => onReject(invocationId)}
        disabled={isBusy}
        className="min-w-[80px] transition-[background-color,border-color,color,box-shadow,scale] duration-150 ease-out hover:border-destructive/30 hover:bg-destructive/8 hover:text-destructive"
      >
        {busyAction === "reject" ? (
          <Loader2 className="animate-spin" aria-hidden="true" />
        ) : (
          <XCircle data-icon="inline-start" aria-hidden="true" />
        )}
        {t("reject")}
      </Button>
      <Button
        type="button"
        size="sm"
        onClick={() => onApprove(invocationId)}
        disabled={isBusy}
        className="min-w-[88px]"
      >
        {busyAction === "approve" ? (
          <Loader2 className="animate-spin" aria-hidden="true" />
        ) : (
          <CheckCircle2 data-icon="inline-start" aria-hidden="true" />
        )}
        {t("approve")}
      </Button>
    </div>
  );
}

// ── Invocation Row ──

function InvocationRow({
  invocation,
  showActions,
  busyAction,
  onApprove,
  onReject,
  index,
}: {
  invocation: ToolInvocation;
  showActions: boolean;
  busyAction: ToolAction | null;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  index: number;
}) {
  const locale = useLocale();
  const t = useTranslations("tools.approvals");
  const translatedStatus = t.has(`status.${invocation.status}`)
    ? t(`status.${invocation.status}`)
    : getStatusLabel(invocation.status);

  return (
    <div
      className={cn(
        "group relative flex flex-col gap-3 rounded-2xl border border-transparent bg-background/60 p-4 shadow-[var(--surface-shadow)] transition-[background-color,box-shadow] duration-150 ease-out hover:bg-background hover:shadow-[var(--surface-shadow-hover)] sm:flex-row sm:items-center sm:justify-between",
        invocation.status === "awaiting_approval" ||
          invocation.status === "pending_approval"
          ? "border-warning/25 bg-warning/[0.03]"
          : "",
      )}
      style={{ animationDelay: `${index * 40}ms` }}
    >
      {/* Left: info */}
      <div className="flex min-w-0 flex-1 items-start gap-3">
        {/* Status indicator */}
        <div className="mt-1 hidden sm:block">
          <StatusDot
            status={invocation.status}
            animate={isPendingApproval(invocation)}
          />
        </div>

        <div className="min-w-0 flex-1">
          {/* Primary line: tool name + badges */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-foreground">
              {invocation.toolName}
            </span>

            {/* Source badge */}
            <span className="inline-flex items-center gap-1 rounded-md bg-muted/80 px-2 py-0.5 text-[0.7rem] font-medium uppercase tracking-wider text-muted-foreground">
              <Zap className="size-3" aria-hidden="true" />
              {invocation.toolSource}
            </span>

            <RiskBadge riskLevel={invocation.riskLevel} />

            {/* Status pill */}
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[0.7rem] font-semibold uppercase tracking-wider ring-1",
                getStatusColor(invocation.status),
                getStatusBg(invocation.status),
                getStatusRing(invocation.status),
              )}
            >
              <StatusDot
                status={invocation.status}
                animate={isPendingApproval(invocation)}
              />
              {translatedStatus}
            </span>
          </div>

          <p className="mt-2 text-sm leading-5 text-foreground/80">
            {summarizeToolInput(
              getToolDisplayName(invocation.toolName),
              invocation.input,
            )}
          </p>

          {/* Secondary line: metadata */}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <time dateTime={invocation.createdAt}>
              {new Intl.DateTimeFormat(locale, {
                dateStyle: "medium",
                timeStyle: "short",
              }).format(new Date(invocation.createdAt))}
            </time>

            {invocation.latencyMs !== null && (
              <>
                <span className="text-muted/60">·</span>
                <span className="inline-flex items-center gap-1">
                  <Activity className="size-3" aria-hidden="true" />
                  {invocation.latencyMs}ms
                </span>
              </>
            )}

            {invocation.conversationId && (
              <>
                <span className="text-muted/60">·</span>
                <Link
                  href={`/chat?conversationId=${invocation.conversationId}`}
                  className="inline-flex items-center gap-1 text-primary transition-colors hover:underline"
                >
                  <MessageSquare className="size-3" aria-hidden="true" />
                  {t("conversation")}
                </Link>
              </>
            )}

            {invocation.errorMessage && (
              <>
                <span className="text-muted/60">·</span>
                <span className="max-w-xs truncate font-medium text-destructive">
                  {invocation.errorMessage}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Right: actions */}
      {showActions && (
        <div className="shrink-0">
          <InvocationActions
            invocationId={invocation.id}
            busyAction={busyAction}
            onApprove={onApprove}
            onReject={onReject}
          />
        </div>
      )}
    </div>
  );
}

// ── Invocation List ──

function InvocationList({
  invocations,
  filterStatus,
  busyInvocation,
  onApprove,
  onReject,
}: {
  invocations: ToolInvocation[];
  filterStatus: string;
  busyInvocation: { id: string; action: ToolAction } | null;
  onApprove: (invocationId: string) => void;
  onReject: (invocationId: string) => void;
}) {
  const t = useTranslations("tools.approvals");
  if (invocations.length === 0) {
    return (
      <Empty className="mt-4">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Shield aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>{t("emptyTitle")}</EmptyTitle>
          <EmptyDescription>
            {filterStatus !== "all"
              ? t("emptyFiltered")
              : t("emptyDescription")}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="mt-4 flex flex-col gap-2">
      {/* Column header */}
      <div className="flex items-center justify-between px-1 pb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        <span>{t("invocations")}</span>
        <span>{t("results", { count: invocations.length })}</span>
      </div>

      {invocations.map((invocation, i) => (
        <InvocationRow
          key={invocation.id}
          invocation={invocation}
          showActions={isPendingApproval(invocation)}
          busyAction={
            busyInvocation?.id === invocation.id ? busyInvocation.action : null
          }
          onApprove={onApprove}
          onReject={onReject}
          index={i}
        />
      ))}
    </div>
  );
}

// ── Page ──

function filterByStatus(invocations: ToolInvocation[], filterStatus: string) {
  if (filterStatus === "pending") {
    return invocations.filter(isPendingApproval);
  }
  if (filterStatus === "history") {
    return invocations.filter((i) => HISTORY_STATUSES.has(i.status));
  }
  return invocations;
}

async function submitInvocationAction(
  invocationId: string,
  action: ToolAction,
) {
  const res = await fetch(
    `/api/workspace/tool-invocations/${invocationId}/${action}`,
    { method: "POST" },
  );
  if (!res.ok) {
    const error = await res.json().catch(() => null);
    throw new Error(error?.error || `Failed to ${action} invocation`);
  }
}

async function fetchToolInvocations({
  workspaceId,
  filterStatus,
  signal,
}: {
  workspaceId?: string | null;
  filterStatus: string;
  signal?: AbortSignal;
}) {
  if (!workspaceId) return [];

  const searchParams = new URLSearchParams({
    workspaceId,
    limit: "100",
  });
  if (filterStatus === "pending") {
    searchParams.set("status", "awaiting_approval");
  }

  const res = await fetch(
    `/api/workspace/tool-invocations?${searchParams.toString()}`,
    { signal },
  );
  if (!res.ok) throw new Error("Failed to load tool invocations");
  return (await res.json()) as ToolInvocation[];
}

type InvocationTabsProps = {
  filterStatus: string;
  invocations: ToolInvocation[];
  busyInvocation: BusyInvocation;
  onFilterStatusChange: (status: string) => void;
  onApprove: (invocationId: string) => void;
  onReject: (invocationId: string) => void;
  t: (key: "all" | "pending" | "history") => string;
};

function InvocationTabs({
  filterStatus,
  invocations,
  busyInvocation,
  onFilterStatusChange,
  onApprove,
  onReject,
  t,
}: InvocationTabsProps) {
  return (
    <div className="animate-in-up stagger-2">
      <Tabs value={filterStatus} onValueChange={onFilterStatusChange}>
        <TabsList className="w-full overflow-x-auto sm:w-auto sm:overflow-visible">
          <TabsTrigger value="all" className="gap-1.5">
            <Activity className="size-3.5" aria-hidden="true" />
            {t("all")}
          </TabsTrigger>
          <TabsTrigger value="pending" className="gap-1.5">
            <Clock className="size-3.5" aria-hidden="true" />
            {t("pending")}
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-1.5">
            <CheckCircle2 className="size-3.5" aria-hidden="true" />
            {t("history")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value={filterStatus}>
          <InvocationList
            invocations={filterByStatus(invocations, filterStatus)}
            filterStatus={filterStatus}
            busyInvocation={busyInvocation}
            onApprove={onApprove}
            onReject={onReject}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

type FetchInvocations = (signal?: AbortSignal) => Promise<ToolInvocation[]>;

function useToolInvocationData(
  workspaceId: string | null,
  filterStatus: string,
) {
  const [invocations, setInvocations] = useState<ToolInvocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetchInvocations = useCallback(
    (signal?: AbortSignal) =>
      fetchToolInvocations({ workspaceId, filterStatus, signal }),
    [filterStatus, workspaceId],
  );

  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;
    const controller = new AbortController();

    async function loadInvocations() {
      setError(null);
      try {
        const data = await fetchInvocations(controller.signal);
        if (!cancelled) setInvocations(data);
      } catch (err) {
        if (err instanceof Error && err.name !== "AbortError") {
          setError(err.message);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadInvocations();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [fetchInvocations, workspaceId]);

  useEffect(() => {
    if (!workspaceId) return;
    const refresh = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      void fetchInvocations()
        .then(setInvocations)
        .catch(() => {
          // Keep polling silent; explicit loads and actions surface errors.
        });
    };
    const interval = setInterval(refresh, 30_000);
    const onVisible = () => {
      if (!document.hidden) refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [fetchInvocations, workspaceId]);

  return {
    invocations,
    loading,
    error,
    setError,
    fetchInvocations,
    setInvocations,
  };
}

function useInvocationActions(
  fetchInvocations: FetchInvocations,
  setInvocations: (invocations: ToolInvocation[]) => void,
) {
  const t = useTranslations("tools.approvals");
  const [busyInvocation, setBusyInvocation] = useState<BusyInvocation>(null);
  const runInvocationAction = useCallback(
    async (invocationId: string, action: ToolAction) => {
      setBusyInvocation({ id: invocationId, action });
      try {
        await submitInvocationAction(invocationId, action);
        toast.success(action === "approve" ? t("approved") : t("rejected"));
        setInvocations(await fetchInvocations());
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("actionFailed"));
      } finally {
        setBusyInvocation(null);
      }
    },
    [fetchInvocations, setInvocations, t],
  );

  return { busyInvocation, runInvocationAction };
}

export function ToolApprovalsPanel() {
  const t = useTranslations("tools.filters");
  const tApprovals = useTranslations("tools.approvals");
  const { workspaceId, isLoading: workspaceLoading } = useWorkspace();
  const [filterStatus, setFilterStatus] = useState<string>("pending");
  const {
    invocations,
    loading,
    error,
    setError,
    fetchInvocations,
    setInvocations,
  } = useToolInvocationData(workspaceId, filterStatus);
  const { busyInvocation, runInvocationAction } = useInvocationActions(
    fetchInvocations,
    setInvocations,
  );

  const pendingInvocations = useMemo(
    () => invocations.filter(isPendingApproval),
    [invocations],
  );

  if (workspaceLoading || !workspaceId || loading) {
    return <PageLoading label={tApprovals("loading")} />;
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-destructive/25 bg-destructive/5 p-5">
        <h2 className="text-base font-semibold">{tApprovals("loadFailed")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {tApprovals("loadFailedDescription")}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-4"
          onClick={() => {
            setError(null);
            void fetchInvocations()
              .then(setInvocations)
              .catch((retryError) => {
                const message =
                  retryError instanceof Error
                    ? retryError.message
                    : tApprovals("loadFailed");
                setError(message);
                toast.error(message);
              });
          }}
        >
          {tApprovals("retry")}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-2xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold">{tApprovals("title")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {pendingInvocations.length > 0
              ? tApprovals("pendingSummary", {
                  count: pendingInvocations.length,
                })
              : tApprovals("clearSummary")}
          </p>
        </div>
        {pendingInvocations.length > 0 ? (
          <Badge className="self-start sm:self-auto" variant="secondary">
            {tApprovals("pendingCount", { count: pendingInvocations.length })}
          </Badge>
        ) : null}
      </div>
      <InvocationTabs
        filterStatus={filterStatus}
        invocations={invocations}
        busyInvocation={busyInvocation}
        onFilterStatusChange={setFilterStatus}
        onApprove={(id) => void runInvocationAction(id, "approve")}
        onReject={(id) => void runInvocationAction(id, "reject")}
        t={t}
      />
    </div>
  );
}
