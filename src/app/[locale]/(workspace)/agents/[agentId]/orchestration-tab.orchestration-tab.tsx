"use client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { OrchestrationLimits } from "./orchestration-tab.limits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { NetworkIcon, SaveIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { RunHistory } from "./orchestration-tab.run-history";
import type { Agent, DelegationBinding, DelegationConfig } from "./types";
import { updateSpecialistVersion } from "./delegation-version";
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
    <div className="flex flex-col gap-3">
      <section className="rounded-[1.125rem] border border-border/65 bg-card/85 p-4 shadow-[var(--surface-shadow)] sm:p-5">
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
        <Alert className="mt-4">
          <AlertTitle>{t("modelContextTitle")}</AlertTitle>
          <AlertDescription>{t("modelContextDescription")}</AlertDescription>
        </Alert>
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
          <div className="mt-4 grid grid-cols-1 gap-2">
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
                    "min-w-0 rounded-xl border p-3 transition-[background-color,border-color] duration-150 ease-out",
                    selected && "border-primary/35 bg-primary/5",
                  )}
                >
                  <label className="flex cursor-pointer items-start gap-3">
                    <Checkbox
                      aria-label={t("selectSpecialist", {
                        name: candidate.name,
                      })}
                      checked={selected}
                      disabled={saving}
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
                        <div className="mb-3 flex flex-col items-start gap-2">
                          <p className="text-xs text-warning">
                            {t("pinnedVersionOutdated")}
                          </p>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={saving}
                            aria-label={t("updateSpecialistVersionLabel", {
                              name: candidate.name,
                            })}
                            onClick={() => {
                              setConfig({
                                ...config,
                                bindings: updateSpecialistVersion(
                                  config.bindings,
                                  candidate.id,
                                  candidate.activeVersionId!,
                                ),
                              });
                              document
                                .getElementById(
                                  `delegation-instructions-${candidate.id}`,
                                )
                                ?.focus();
                            }}
                          >
                            {t("updateSpecialistVersion")}
                          </Button>
                        </div>
                      ) : null}
                      {!binding.childVersion ? (
                        <p
                          className="mb-3 text-xs text-muted-foreground"
                          role="status"
                        >
                          {t("versionPendingSave")}
                        </p>
                      ) : null}
                      <Button
                        asChild
                        variant="link"
                        size="sm"
                        className="mb-2 h-auto max-w-full whitespace-normal text-left"
                      >
                        <Link href={`/agents/${candidate.id}`}>
                          {t("configureSpecialist", { name: candidate.name })}
                        </Link>
                      </Button>
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
                        disabled={saving}
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
        <OrchestrationLimits
          agentId={agent.id}
          policy={config.policy}
          setPolicyAction={(policy) => setConfig({ ...config, policy })}
          disabled={saving}
        />
        <div className="mt-4 flex justify-end border-t border-border/55 pt-4">
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
