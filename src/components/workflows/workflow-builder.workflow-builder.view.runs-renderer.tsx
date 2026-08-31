import { AlertCircleIcon, CheckIcon, RefreshCwIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";

import { runBadgeVariant } from "./workflow-builder.node-types";
import type { WorkflowBuilderViewModel } from "./workflow-builder.workflow-builder";
export function useWorkflowRunsRenderer(model: WorkflowBuilderViewModel) {
  const {
    loadRunDetail,
    loadRuns,
    runs,
    runsLoadError,
    runsLoaded,
    runsLoading,
    t,
  } = model;
  function renderRuns() {
    return (
      <div className="flex flex-col gap-3 p-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => void loadRuns()}
          disabled={runsLoading}
        >
          <RefreshCwIcon
            data-icon="inline-start"
            className={runsLoading ? "animate-spin" : undefined}
          />
          {t("refreshRuns")}
        </Button>
        {!runsLoaded && runsLoading ? (
          <Empty className="min-h-48 p-5">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Spinner />
              </EmptyMedia>
              <EmptyTitle>{t("loading")}</EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : !runsLoaded && runsLoadError ? (
          <Alert variant="destructive">
            <AlertCircleIcon />
            <AlertTitle>{t("runsLoadFailed")}</AlertTitle>
            <AlertDescription>
              <p>{runsLoadError}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void loadRuns()}
              >
                {t("refreshRuns")}
              </Button>
            </AlertDescription>
          </Alert>
        ) : runs.length === 0 ? (
          <Empty className="min-h-48 p-5">
            <EmptyHeader>
              <EmptyTitle>{t("noRuns")}</EmptyTitle>
              <EmptyDescription>{t("noRunsHint")}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          runs.map((run) => (
            <button
              type="button"
              key={run.id}
              onClick={() => void loadRunDetail(run.id)}
              className="rounded-xl border border-border/75 p-3 text-left transition-[background-color,scale] duration-150 ease-out hover:bg-muted/60 active:scale-[0.96]"
            >
              <span className="flex items-center justify-between gap-2">
                <span className="font-mono text-[11px] text-muted-foreground">
                  {run.id.slice(0, 8)}
                </span>
                <Badge variant={runBadgeVariant(run)}>
                  {run.status === "completed" ? (
                    <CheckIcon aria-hidden="true" />
                  ) : null}
                  {t(`status.${run.status}`)}
                </Badge>
              </span>
              <span className="mt-2 block text-xs tabular-nums text-muted-foreground">
                {new Date(run.queuedAt).toLocaleString()}
              </span>
              {run.error ? (
                <span className="mt-2 line-clamp-3 block text-xs text-destructive">
                  {run.error}
                </span>
              ) : null}
            </button>
          ))
        )}
      </div>
    );
  }
  return renderRuns;
}
