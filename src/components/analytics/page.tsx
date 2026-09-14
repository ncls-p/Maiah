"use client";
import { AnalyticsExport } from "./export-button";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { WorkspacePage } from "@/components/workspace-page";
import { PageLoading } from "@/components/page-loading";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { GovernanceSelect } from "@/components/iam/governance-select";
import { useWorkspace } from "@/hooks/use-workspace";
import type { AnalyticsKind, AnalyticsScope } from "@/modules/analytics/query";
import type { AuditAnalytics, UsageAnalytics } from "@/modules/analytics/types";
import { AnalyticsFilters, defaultFilters, type FilterValues } from "./filters";
import { AuditResults, ResultsPagination, UsageResults } from "./results";

function queryString(
  scope: AnalyticsScope,
  filters: FilterValues,
  offset: number,
) {
  const query = new URLSearchParams({
    scope: scope.type,
    offset: String(offset),
  });
  if (scope.type !== "application") query.set("scopeId", scope.id);
  for (const [key, value] of Object.entries(filters))
    if (value)
      query.set(
        key,
        key === "from" || key === "to"
          ? new Date(
              `${value}${key === "to" ? ":59.999" : ":00"}Z`,
            ).toISOString()
          : value,
      );
  return query.toString();
}
export function AnalyticsPage({ kind }: { kind: AnalyticsKind }) {
  const { workspaceId } = useWorkspace();
  return (
    <AnalyticsPageContent
      key={`${kind}:${workspaceId}`}
      kind={kind}
      workspaceId={workspaceId}
    />
  );
}
function AnalyticsPageContent({
  kind,
  workspaceId,
}: {
  kind: AnalyticsKind;
  workspaceId: string | null;
}) {
  const t = useTranslations("analytics");
  const shell = useTranslations("shell");
  const [scopes, setScopes] = useState<AnalyticsScope[] | null>(null);
  const [scopeId, setScopeId] = useState("");
  const [draft, setDraft] = useState<FilterValues>(defaultFilters);
  const [applied, setApplied] = useState<FilterValues>(draft);
  const [offset, setOffset] = useState(0);
  const [revision, setRevision] = useState(0);
  const [scopeRevision, setScopeRevision] = useState(0);
  const [response, setResponse] = useState<{
    key: string;
    data: UsageAnalytics | AuditAnalytics;
  } | null>(null);
  const [error, setError] = useState(false);
  const [denied, setDenied] = useState(false);
  const scope = scopes?.find((item) => item.id === scopeId);
  const query = scope ? queryString(scope, applied, offset) : "";
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/analytics/scopes?kind=${kind}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error();
        return res.json();
      })
      .then((result: { scopes: AnalyticsScope[] }) => {
        if (controller.signal.aborted) return;
        setScopes(result.scopes);
        setScopeId(
          (current) =>
            current ||
            result.scopes.find((item) => item.type === "application")?.id ||
            result.scopes.find((item) => item.id === workspaceId)?.id ||
            result.scopes[0]?.id ||
            "",
        );
        setError(false);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => controller.abort();
  }, [kind, workspaceId, scopeRevision]);
  useEffect(() => {
    if (!query) return;
    const controller = new AbortController();
    fetch(`/api/analytics/${kind}?${query}`, { signal: controller.signal })
      .then(async (res) => {
        if (res.status === 403) {
          if (!controller.signal.aborted) setDenied(true);
          throw new Error();
        }
        if (!res.ok) throw new Error();
        return res.json();
      })
      .then((data: UsageAnalytics | AuditAnalytics) => {
        if (controller.signal.aborted) return;
        setResponse({ key: query, data });
        setError(false);
        setDenied(false);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => controller.abort();
  }, [kind, query, revision]);
  const data =
    response?.key === query && !error && !denied ? response.data : null;
  const busy = Boolean(query && !data && !error);
  if (denied || scopes?.length === 0)
    return (
      <WorkspacePage title={shell("accessDeniedTitle")}>
        <p>{shell("accessDeniedDescription")}</p>
      </WorkspacePage>
    );
  function apply() {
    setOffset(0);
    setResponse(null);
    setError(false);
    setApplied({ ...draft });
    setRevision((value) => value + 1);
  }
  return (
    <WorkspacePage
      title={t(kind === "usage" ? "usageTitle" : "auditTitle")}
      description={t("description")}
      width="wide"
    >
      <div className="flex min-w-0 flex-col gap-5">
        {error && (
          <Alert variant="destructive">
            <AlertTitle>{t("loadFailed")}</AlertTitle>
            <AlertDescription>
              {t("loadFailedHint")}
              <Button
                variant="outline"
                onClick={() => {
                  setError(false);
                  if (!scopes) setScopeRevision((value) => value + 1);
                  setRevision((value) => value + 1);
                }}
              >
                {t("retry")}
              </Button>
            </AlertDescription>
          </Alert>
        )}
        {scope && scopes && (
          <AnalyticsFilters
            kind={kind}
            scopes={scopes}
            scope={scope}
            onScope={(value) => {
              setScopeId(value);
              setOffset(0);
              setDraft(defaultFilters());
              setApplied(defaultFilters());
              setError(false);
            }}
            values={draft}
            onChange={setDraft}
            onApply={apply}
            onReset={() => {
              const defaults = defaultFilters();
              setDraft(defaults);
              setApplied(defaults);
              setOffset(0);
              setError(false);
            }}
            facets={data?.facets ?? {}}
            busy={busy}
          />
        )}
        {kind === "usage" && scope && (
          <div className="grid gap-3 sm:grid-cols-2">
            <GovernanceSelect
              label={t("groupBy")}
              value={draft.groupBy}
              onChange={(value) => {
                setDraft({ ...draft, groupBy: value });
                setApplied({ ...applied, groupBy: value });
                setOffset(0);
                setError(false);
              }}
              options={[
                "provider",
                "model",
                "organization",
                "workspace",
                "user",
                "agent",
                "operation",
              ].map((id) => ({ id, name: t(id) }))}
            />
            <GovernanceSelect
              label={t("bucket")}
              value={draft.bucket}
              onChange={(value) => {
                setDraft({ ...draft, bucket: value });
                setApplied({ ...applied, bucket: value });
                setError(false);
              }}
              options={["day", "week", "month"].map((id) => ({
                id,
                name: t(id),
              }))}
            />
          </div>
        )}
        {(!scopes || busy) && !error && <PageLoading label={t("loading")} />}
        {data && (
          <>
            <p className="text-xs text-muted-foreground">
              {t("scopeHint")}{" "}
              {data.scope.type === "application"
                ? t("application")
                : data.scope.name}
            </p>
            {kind === "usage" ? (
              <UsageResults
                key={applied.groupBy}
                data={data as UsageAnalytics}
              />
            ) : (
              <AuditResults data={data as AuditAnalytics} />
            )}
            {data.scope.canExport && (
              <AnalyticsExport kind={kind} query={query} />
            )}
            <ResultsPagination
              offset={data.offset}
              limit={data.limit}
              total={"groups" in data ? data.totals.events : data.totals.total}
              busy={busy}
              onPage={(value) => {
                setOffset(value);
                setError(false);
              }}
            />
          </>
        )}
      </div>
    </WorkspacePage>
  );
}
