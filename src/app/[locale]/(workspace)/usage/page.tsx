"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { PageLoading } from "@/components/page-loading";
import { RequireWorkspaceAccess } from "@/components/require-workspace-access";
import { WorkspacePage } from "@/components/workspace-page";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/hooks/use-workspace";

import {
  UsageDashboard,
  UsageDashboardSkeleton,
  type UsageResponse,
} from "./usage-dashboard";

type UsageFilters = {
  operation: string;
  from: string;
  to: string;
};

type LoadUsageInput = UsageFilters & {
  workspaceId: string;
};

function buildUsageQuery({ workspaceId, operation, from, to }: LoadUsageInput) {
  const params = new URLSearchParams({ workspaceId, limit: "100" });
  if (operation.trim()) params.set("operation", operation.trim());
  if (from) params.set("from", new Date(`${from}T00:00:00`).toISOString());
  if (to) params.set("to", new Date(`${to}T23:59:59`).toISOString());
  return params.toString();
}

async function fetchUsage(input: LoadUsageInput) {
  const res = await fetch(`/api/workspace/usage?${buildUsageQuery(input)}`);
  if (!res.ok) throw new Error("Failed to load usage");
  return (await res.json()) as UsageResponse;
}

function UsagePageContent() {
  const t = useTranslations("admin");
  const tCommon = useTranslations("common");
  const { workspaceId, isLoading: workspaceLoading } = useWorkspace();
  const [data, setData] = useState<UsageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [operationFilter, setOperationFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const loadUsage = useCallback(
    async (options?: Partial<UsageFilters> & { silent?: boolean }) => {
      if (!workspaceId) return;
      if (options?.silent) setRefreshing(true);
      else setLoading(true);
      setLoadError(false);

      try {
        setData(
          await fetchUsage({
            workspaceId,
            operation: operationFilter,
            from: fromDate,
            to: toDate,
            ...options,
          }),
        );
      } catch {
        setLoadError(true);
        return;
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [fromDate, operationFilter, toDate, workspaceId],
  );

  useEffect(() => {
    if (!workspaceId) return;
    const timeout = window.setTimeout(() => {
      void loadUsage();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [loadUsage, workspaceId]);

  if (workspaceLoading || !workspaceId) {
    return <PageLoading label={tCommon("loading")} />;
  }

  return (
    <WorkspacePage
      title={t("usageTitle")}
      description={t("usageDescription")}
      width="wide"
    >
      {loadError ? (
        <div
          className="mb-5 rounded-2xl border border-destructive/25 bg-destructive/5 p-5"
          role="alert"
        >
          <h2 className="text-base font-semibold">{t("usage.loadFailed")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("usage.loadFailedDescription")}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => void loadUsage()}
          >
            {t("usage.retry")}
          </Button>
        </div>
      ) : null}
      {loading && !data ? (
        <UsageDashboardSkeleton />
      ) : data ? (
        <UsageDashboard
          data={data}
          busy={refreshing}
          operationFilter={operationFilter}
          fromDate={fromDate}
          toDate={toDate}
          onOperationChangeAction={setOperationFilter}
          onFromChangeAction={setFromDate}
          onToChangeAction={setToDate}
          onApplyAction={() => void loadUsage({ silent: true })}
          onResetAction={() => {
            setOperationFilter("");
            setFromDate("");
            setToDate("");
            void loadUsage({
              silent: true,
              operation: "",
              from: "",
              to: "",
            });
          }}
        />
      ) : null}
    </WorkspacePage>
  );
}

export default function UsagePage() {
  return (
    <RequireWorkspaceAccess required="canViewUsage">
      <UsagePageContent />
    </RequireWorkspaceAccess>
  );
}
