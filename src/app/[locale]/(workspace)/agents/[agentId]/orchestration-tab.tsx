"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  BracesIcon,
  CircleStopIcon,
  NetworkIcon,
  PlayIcon,
  RefreshCwIcon,
  SaveIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Link } from "@/i18n/navigation";
import { useWorkspace } from "@/hooks/use-workspace";
import { AdvancedSection } from "@/components/ui/advanced-section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import type {
  Agent,
  DelegationBinding,
  DelegationConfig,
  OrchestrationPolicy,
} from "./types";

type RunSummary = {
  id: string;
  status: string;
  trigger: string;
  inputPreviewJson?: { prompt?: string } | null;
  outputPreviewJson?: { text?: string } | null;
  inputTokens: number | null;
  outputTokens: number | null;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
};

const statusTone: Record<string, string> = {
  success: "border-success/30 bg-success/10 text-success",
  failed: "border-destructive/30 bg-destructive/10 text-destructive",
  cancelled: "border-border bg-muted text-muted-foreground",
  timed_out: "border-warning/30 bg-warning/10 text-warning",
  running: "border-info/30 bg-info/10 text-info",
  queued: "border-info/30 bg-info/10 text-info",
};

function policyField(
  policy: OrchestrationPolicy,
  setPolicy: (policy: OrchestrationPolicy) => void,
  key: keyof OrchestrationPolicy,
  label: string,
  min: number,
  max: number,
  step = 1,
  description?: string,
) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={`orchestration-${key}`}>{label}</Label>
      <Input
        id={`orchestration-${key}`}
        name={`orchestration-${key}`}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={step}
        value={policy[key]}
        onChange={(event) =>
          setPolicy({
            ...policy,
            [key]: Math.max(min, Math.min(max, Number(event.target.value))),
          })
        }
      />
      {description ? (
        <p className="text-xs text-muted-foreground">{description}</p>
      ) : null}
    </div>
  );
}

function RunHistory({ agentId }: { agentId: string }) {
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

export function OrchestrationTab({
  agent,
  availableAgents,
  config,
  setConfigAction: setConfig,
  saving,
  onSaveAction: onSave,
}: {
  agent: Agent;
  availableAgents: Agent[];
  config: DelegationConfig;
  setConfigAction: (config: DelegationConfig) => void;
  saving: boolean;
  onSaveAction: () => void;
}) {
  const t = useTranslations("agents.orchestration");
  const candidates = useMemo(
    () =>
      availableAgents.filter(
        (candidate) => candidate.id !== agent.id && candidate.activeVersionId,
      ),
    [agent.id, availableAgents],
  );
  const selectedById = new Map(
    config.bindings.map((binding) => [binding.childAgentId, binding]),
  );

  function toggleAgent(candidate: Agent, checked: boolean) {
    const nextBindings = checked
      ? [
          ...config.bindings,
          {
            childAgentId: candidate.id,
            childAgentVersionId: candidate.activeVersionId!,
            instructions: candidate.description?.trim() ?? "",
            childAgent: {
              id: candidate.id,
              name: candidate.name,
              kind: candidate.kind,
              activeVersionId: candidate.activeVersionId ?? null,
            },
          } satisfies DelegationBinding,
        ]
      : config.bindings.filter(
          (binding) => binding.childAgentId !== candidate.id,
        );
    setConfig({ ...config, bindings: nextBindings });
  }

  function updateInstructions(childAgentId: string, instructions: string) {
    setConfig({
      ...config,
      bindings: config.bindings.map((binding) =>
        binding.childAgentId === childAgentId
          ? { ...binding, instructions }
          : binding,
      ),
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-2xl border bg-card p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <NetworkIcon className="size-4" aria-hidden="true" />
              </span>
              <div>
                <h3 className="text-base font-semibold">
                  {t("specialistsTitle")}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {t("specialistsDescription")}
                </p>
              </div>
            </div>
          </div>
          <Badge variant="secondary">
            {t("selectedCount", { count: config.bindings.length })}
          </Badge>
        </div>

        {candidates.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed p-5 text-center">
            <p className="text-sm font-medium">{t("noSpecialists")}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("noSpecialistsDescription")}
            </p>
            <Button asChild variant="outline" size="sm" className="mt-3">
              <Link href="/agents">{t("createSpecialist")}</Link>
            </Button>
          </div>
        ) : (
          <div className="mt-4 grid gap-2">
            {candidates.map((candidate) => {
              const binding = selectedById.get(candidate.id);
              const selected = Boolean(binding);
              const pinnedVersion = binding?.childVersion;
              const hasNewerVersion = Boolean(
                binding &&
                candidate.activeVersionId &&
                candidate.activeVersionId !== binding.childAgentVersionId,
              );
              return (
                <div
                  key={candidate.id}
                  className={cn(
                    "rounded-xl border p-3 transition-[background-color,border-color]",
                    selected && "border-primary/35 bg-primary/5",
                  )}
                >
                  <label className="flex cursor-pointer items-start gap-3">
                    <Checkbox
                      aria-label={t("selectSpecialist", {
                        name: candidate.name,
                      })}
                      checked={selected}
                      onCheckedChange={(checked) =>
                        toggleAgent(candidate, checked === true)
                      }
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {candidate.name}
                      </span>
                      <span className="mt-0.5 block line-clamp-2 text-xs text-muted-foreground">
                        {candidate.description || t("specialistFallback")}
                      </span>
                    </span>
                    <Badge
                      variant="outline"
                      className={cn(
                        "shrink-0 text-[0.65rem] tabular-nums",
                        hasNewerVersion && "border-warning/35 text-warning",
                      )}
                    >
                      {pinnedVersion
                        ? t("pinnedVersionNumber", {
                            version: pinnedVersion.versionNumber,
                          })
                        : t("currentVersion")}
                    </Badge>
                  </label>
                  {binding ? (
                    <div className="mt-3 border-t pt-3">
                      {hasNewerVersion ? (
                        <p className="mb-3 text-xs text-warning">
                          {t("pinnedVersionOutdated")}
                        </p>
                      ) : null}
                      <Label
                        htmlFor={`delegation-instructions-${candidate.id}`}
                      >
                        {t("instructions")}
                      </Label>
                      {!binding.instructions?.trim() ? (
                        <p className="mt-1 text-xs text-warning">
                          {t("instructionsMissing")}
                        </p>
                      ) : null}
                      <Textarea
                        id={`delegation-instructions-${candidate.id}`}
                        name={`delegation-instructions-${candidate.id}`}
                        className="mt-2 min-h-20"
                        placeholder={t("instructionsPlaceholder")}
                        value={binding.instructions ?? ""}
                        onChange={(event) =>
                          updateInstructions(candidate.id, event.target.value)
                        }
                      />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}

        <AdvancedSection
          label={t("limitsTitle")}
          hint={t("limitsDescription")}
          storageKey={`advanced:orchestration:${agent.id}`}
          className="mt-4"
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {policyField(
              config.policy,
              (policy) => setConfig({ ...config, policy }),
              "maxDepth",
              t("maxDepth"),
              1,
              4,
            )}
            {policyField(
              config.policy,
              (policy) => setConfig({ ...config, policy }),
              "maxDelegations",
              t("maxDelegations"),
              1,
              12,
            )}
            {policyField(
              config.policy,
              (policy) => setConfig({ ...config, policy }),
              "maxParallel",
              t("maxParallel"),
              1,
              4,
            )}
            {policyField(
              config.policy,
              (policy) => setConfig({ ...config, policy }),
              "maxChildSteps",
              t("maxChildSteps"),
              2,
              20,
              1,
              t("maxChildStepsDescription"),
            )}
            {policyField(
              config.policy,
              (policy) => setConfig({ ...config, policy }),
              "maxTotalTokens",
              t("maxTotalTokens"),
              1000,
              100000,
              1000,
            )}
            {policyField(
              config.policy,
              (policy) => setConfig({ ...config, policy }),
              "timeoutMs",
              t("timeoutMs"),
              5000,
              300000,
              5000,
              t("timeoutMsDescription"),
            )}
            {policyField(
              config.policy,
              (policy) => setConfig({ ...config, policy }),
              "resultMaxChars",
              t("resultMaxChars"),
              1000,
              20000,
              1000,
            )}
          </div>
        </AdvancedSection>

        <div className="mt-4 flex justify-end border-t pt-4">
          <Button type="button" disabled={saving} onClick={onSave}>
            {saving ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <SaveIcon data-icon="inline-start" aria-hidden="true" />
            )}
            {t("save")}
          </Button>
        </div>
      </section>

      <RunHistory agentId={agent.id} />
    </div>
  );
}
