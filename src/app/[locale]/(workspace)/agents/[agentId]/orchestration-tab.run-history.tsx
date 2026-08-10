"use client";

import {
  BracesIcon,
  CircleStopIcon,
  PlayIcon,
  RefreshCwIcon,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useWorkspace } from "@/hooks/use-workspace";
import { cn } from "@/lib/utils";

import { RunSummary, statusTone } from "./orchestration-tab.run-summary";

export function RunHistory({ agentId }: { agentId: string }) {
  const t = useTranslations("agents.orchestration");
  const locale = useLocale();
  const { workspaceId } = useWorkspace();
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningDryRun, setRunningDryRun] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [dryRunResult, setDryRunResult] = useState<string | null>(null);

  const loadRuns = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const response = await fetch(
        `/api/workspace/agents/${agentId}/runs?workspaceId=${workspaceId}&limit=12`,
      );
      if (!response.ok) throw new Error(t("runsLoadFailed"));
      setRuns((await response.json()) as RunSummary[]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("runsLoadFailed"));
    } finally {
      setLoading(false);
    }
  }, [agentId, t, workspaceId]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadRuns(), 0);
    return () => window.clearTimeout(timeout);
  }, [loadRuns]);

  async function runDryRun() {
    if (!workspaceId || !prompt.trim()) return;
    setRunningDryRun(true);
    setDryRunResult(null);
    try {
      const response = await fetch(`/api/workspace/agents/${agentId}/runs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          prompt: prompt.trim(),
          mode: "dry_run",
          idempotencyKey: `dry-run:${crypto.randomUUID()}`,
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        text?: string;
        error?: string;
      } | null;
      if (!response.ok) throw new Error(payload?.error || t("dryRunFailed"));
      setDryRunResult(payload?.text || t("dryRunEmpty"));
      await loadRuns();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("dryRunFailed"));
    } finally {
      setRunningDryRun(false);
    }
  }

  async function cancelRun(runId: string) {
    if (!workspaceId) return;
    const response = await fetch(
      `/api/workspace/agents/${agentId}/runs/${runId}?workspaceId=${workspaceId}`,
      { method: "DELETE" },
    );
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      toast.error(payload?.error || t("cancelFailed"));
      return;
    }
    toast.success(t("cancelled"));
    await loadRuns();
  }

  return (
    <section className="rounded-2xl border bg-card p-4 sm:p-5">
      <div className="flex flex-col gap-1">
        <h3 className="text-base font-semibold">{t("testTitle")}</h3>
        <p className="text-sm text-muted-foreground">{t("testDescription")}</p>
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
        <Textarea
          name="orchestration-dry-run-prompt"
          aria-label={t("testPrompt")}
          placeholder={t("testPlaceholder")}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          className="min-h-24"
        />
        <Button
          type="button"
          className="self-end"
          disabled={runningDryRun || !prompt.trim()}
          onClick={() => void runDryRun()}
        >
          {runningDryRun ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <PlayIcon data-icon="inline-start" aria-hidden="true" />
          )}
          {t("dryRun")}
        </Button>
      </div>
      {dryRunResult ? (
        <div className="mt-3 rounded-xl border border-info/20 bg-info/5 p-3 text-sm leading-relaxed whitespace-pre-wrap">
          {dryRunResult}
        </div>
      ) : null}

      <div className="mt-6 flex items-center justify-between gap-3 border-t pt-4">
        <div>
          <h3 className="text-sm font-semibold">{t("runsTitle")}</h3>
          <p className="text-xs text-muted-foreground">
            {t("runsDescription")}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={t("refreshRuns")}
          onClick={() => void loadRuns()}
        >
          <RefreshCwIcon aria-hidden="true" />
        </Button>
      </div>
      {loading ? (
        <div
          className="flex min-h-28 items-center justify-center"
          aria-live="polite"
        >
          <Spinner />
          <span className="sr-only">{t("runsLoading")}</span>
        </div>
      ) : runs.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">
          {t("runsEmpty")}
        </p>
      ) : (
        <div className="mt-3 divide-y rounded-xl border">
          {runs.map((run) => {
            const tokens = (run.inputTokens ?? 0) + (run.outputTokens ?? 0);
            return (
              <div
                key={run.id}
                className="flex min-w-0 items-center gap-3 px-3 py-3"
              >
                <BracesIcon
                  className="size-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {run.inputPreviewJson?.prompt || t("runUntitled")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Intl.DateTimeFormat(locale, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(run.createdAt))}
                    {tokens > 0
                      ? ` · ${tokens.toLocaleString(locale)} ${t("tokens")}`
                      : ""}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={cn("shrink-0", statusTone[run.status])}
                >
                  {t(`status.${run.status}`)}
                </Badge>
                {run.status === "running" || run.status === "queued" ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("cancelRun")}
                    onClick={() => void cancelRun(run.id)}
                  >
                    <CircleStopIcon aria-hidden="true" />
                  </Button>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
