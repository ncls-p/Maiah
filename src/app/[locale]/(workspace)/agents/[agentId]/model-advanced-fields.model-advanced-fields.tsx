"use client";
import { useTranslations } from "next-intl";
import { AgentForm, AgentToolPolicyOption, Model, defaultGenParams } from "./types";
import { RefreshCwIcon, BrainCircuitIcon, ShieldCheckIcon, SlidersHorizontalIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FieldContent, FieldLabel, FieldDescription, FieldGroup } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { approvalSources, approvalRiskLevels } from "./model-advanced-fields.approval-risk-levels";
import { ToolPolicyPicker } from "./model-advanced-fields.tool-policy-picker";
import { ReasoningPresetsField } from "./model-advanced-fields.reasoning-presets";

export function useModelAdvancedFieldsController({
  form,
  setFormAction: setForm,
  toolOptions = [],
  selectedModel,
  onResetAction: onReset,
}: {
  form: AgentForm;
  setFormAction: (fn: (prev: AgentForm) => AgentForm) => void;
  toolOptions?: AgentToolPolicyOption[];
  selectedModel?: Model;
  onResetAction?: () => void;
}) {
  const t = useTranslations("agents.model");

  function updateApprovalPolicy(patch: Partial<AgentForm["approvalPolicy"]>) {
    setForm((prev) => ({
      ...prev,
      approvalPolicy: {
        ...prev.approvalPolicy,
        ...patch,
      },
    }));
  }

  function resetGenParams() {
    setForm((prev) => ({
      ...prev,
      temperature: defaultGenParams.temperature,
      topP: defaultGenParams.topP,
      maxOutputTokens: defaultGenParams.maxOutputTokens,
      maxToolCalls: defaultGenParams.maxToolCalls,
      toolChoice: "auto",
      generationSettings: {
        topK: "",
        presencePenalty: "",
        frequencyPenalty: "",
        seed: "",
        maxRetries: "",
        stopSequences: "",
        reasoningPresets: [],
      },
      responseFormat: "text",
    }));
    onReset?.();
  }

  return {
    kind: "ready",
    form,
    resetGenParams,
    selectedModel,
    setForm,
    t,
    toolOptions,
    updateApprovalPolicy,
  } as const;
}

export function ModelAdvancedFields(
  ...args: Parameters<typeof useModelAdvancedFieldsController>
) {
  const model = useModelAdvancedFieldsController(...args);
  if (!("kind" in model)) return model;
  return <ModelAdvancedFieldsView model={model} />;
}


export type ModelAdvancedFieldsViewModel = Extract<
  ReturnType<typeof useModelAdvancedFieldsController>,
  { kind: "ready" }
>;
export function ModelAdvancedFieldsView({
  model,
}: {
  model: ModelAdvancedFieldsViewModel;
}) {
  const { resetGenParams, t } = model;
  return (
    <div className="space-y-4">
      <ModelAdvancedFieldsSection1 model={model} />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="px-0 text-xs"
        onClick={resetGenParams}
      >
        <RefreshCwIcon className="size-3" aria-hidden="true" />
        {t("resetDefaults")}
      </Button>
    </div>
  );
}


export function ModelAdvancedMainSection1({
  model,
}: {
  model: ModelAdvancedFieldsViewModel;
}) {
  const { form, setForm, t } = model;
  return (
    <Field className="sm:col-span-2">
      <FieldLabel htmlFor="agent-stop-sequences" help={t("stopSequencesHelp")}>
        {t("stopSequences")}
      </FieldLabel>
      <FieldContent>
        <Textarea
          id="agent-stop-sequences"
          placeholder={t("oneSequencePerLine")}
          value={form.generationSettings.stopSequences}
          onChange={(e) =>
            setForm((prev) => ({
              ...prev,
              generationSettings: {
                ...prev.generationSettings,
                stopSequences: e.target.value,
              },
            }))
          }
        />
      </FieldContent>
    </Field>
  );
}


export function ModelAdvancedMainSection2({
  model,
}: {
  model: ModelAdvancedFieldsViewModel;
}) {
  const { form, setForm, t } = model;
  return (
    <Field className="sm:col-span-2">
      <FieldLabel htmlFor="agent-guardrail-topics">
        {t("blockedTopics")}
      </FieldLabel>
      <FieldContent>
        <Textarea
          id="agent-guardrail-topics"
          placeholder={t("oneTopicPerLine")}
          value={form.guardrails.blockedTopics.join("\n")}
          onChange={(e) =>
            setForm((prev) => ({
              ...prev,
              guardrails: {
                ...prev.guardrails,
                blockedTopics: e.target.value
                  .split(/\n|,/)
                  .map((topic) => topic.trim())
                  .filter(Boolean),
              },
            }))
          }
        />
      </FieldContent>
    </Field>
  );
}


export function ModelAdvancedMainSection3({
  model,
}: {
  model: ModelAdvancedFieldsViewModel;
}) {
  const { form, setForm, t } = model;
  return (
    <Field>
      <FieldLabel htmlFor="agent-guardrails-enabled" help={t("guardrailsHelp")}>
        {t("guardrails")}
      </FieldLabel>
      <FieldContent>
        <Select
          value={form.guardrails.enabled ? "enabled" : "disabled"}
          onValueChange={(value) =>
            setForm((prev) => ({
              ...prev,
              guardrails: {
                ...prev.guardrails,
                enabled: value === "enabled",
              },
            }))
          }
        >
          <SelectTrigger id="agent-guardrails-enabled" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="disabled">{t("guardrailsDisabled")}</SelectItem>
            <SelectItem value="enabled">{t("guardrailsEnabled")}</SelectItem>
          </SelectContent>
        </Select>
      </FieldContent>
    </Field>
  );
}


export function ModelAdvancedMainSection4({
  model,
}: {
  model: ModelAdvancedFieldsViewModel;
}) {
  const { form, setForm, t } = model;
  return (
    <Field>
      <FieldLabel
        htmlFor="agent-frequency-penalty"
        help={t("frequencyPenaltyHelp")}
      >
        {t("frequencyPenalty")}
      </FieldLabel>
      <FieldContent>
        <Input
          id="agent-frequency-penalty"
          type="number"
          step={0.1}
          placeholder={t("providerDefault")}
          value={form.generationSettings.frequencyPenalty}
          onChange={(e) =>
            setForm((prev) => ({
              ...prev,
              generationSettings: {
                ...prev.generationSettings,
                frequencyPenalty: e.target.value,
              },
            }))
          }
        />
      </FieldContent>
    </Field>
  );
}


export function ModelAdvancedMainSection5({
  model,
}: {
  model: ModelAdvancedFieldsViewModel;
}) {
  const { form, setForm, t } = model;
  return (
    <Field>
      <FieldLabel
        htmlFor="agent-presence-penalty"
        help={t("presencePenaltyHelp")}
      >
        {t("presencePenalty")}
      </FieldLabel>
      <FieldContent>
        <Input
          id="agent-presence-penalty"
          type="number"
          step={0.1}
          placeholder={t("providerDefault")}
          value={form.generationSettings.presencePenalty}
          onChange={(e) =>
            setForm((prev) => ({
              ...prev,
              generationSettings: {
                ...prev.generationSettings,
                presencePenalty: e.target.value,
              },
            }))
          }
        />
      </FieldContent>
    </Field>
  );
}


export function ModelAdvancedMainSection6({
  model,
}: {
  model: ModelAdvancedFieldsViewModel;
}) {
  const { form, setForm, t } = model;
  return (
    <Field>
      <FieldLabel htmlFor="agent-top-k" help={t("topKHelp")}>
        {t("topK")}
      </FieldLabel>
      <FieldContent>
        <Input
          id="agent-top-k"
          type="number"
          placeholder={t("providerDefault")}
          value={form.generationSettings.topK}
          onChange={(e) =>
            setForm((prev) => ({
              ...prev,
              generationSettings: {
                ...prev.generationSettings,
                topK: e.target.value,
              },
            }))
          }
        />
      </FieldContent>
    </Field>
  );
}


export function ModelAdvancedMainSection7({
  model,
}: {
  model: ModelAdvancedFieldsViewModel;
}) {
  const { form, setForm, t } = model;
  return (
    <Field>
      <FieldLabel
        htmlFor="agent-memory-summary-threshold"
        help={t("memorySummaryThresholdHelp")}
      >
        {t("memorySummaryThreshold")}
      </FieldLabel>
      <FieldContent>
        <Input
          id="agent-memory-summary-threshold"
          type="number"
          step={1000}
          value={form.memoryPolicy.summaryThresholdTokens}
          onChange={(e) =>
            setForm((prev) => ({
              ...prev,
              memoryPolicy: {
                ...prev.memoryPolicy,
                summaryThresholdTokens: e.target.value,
              },
            }))
          }
        />
      </FieldContent>
    </Field>
  );
}


export function ModelAdvancedMainSection8({
  model,
}: {
  model: ModelAdvancedFieldsViewModel;
}) {
  const { form, setForm, t } = model;
  return (
    <Field>
      <FieldLabel htmlFor="agent-memory-enabled" help={t("memoryHelp")}>
        {t("memory")}
      </FieldLabel>
      <FieldContent>
        <Select
          value={form.memoryPolicy.enabled ? "enabled" : "disabled"}
          onValueChange={(value) =>
            setForm((prev) => ({
              ...prev,
              memoryPolicy: {
                ...prev.memoryPolicy,
                enabled: value === "enabled",
              },
            }))
          }
        >
          <SelectTrigger id="agent-memory-enabled" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="disabled">{t("memoryDisabled")}</SelectItem>
            <SelectItem value="enabled">{t("memoryEnabled")}</SelectItem>
          </SelectContent>
        </Select>
      </FieldContent>
    </Field>
  );
}


export function ModelAdvancedMainSection9({
  model,
}: {
  model: ModelAdvancedFieldsViewModel;
}) {
  const { form, t, updateApprovalPolicy } = model;
  return (
    <Field>
      <FieldLabel
        htmlFor="agent-approval-sources"
        help={t("approvalSourcesHelp")}
      >
        {t("approvalSources")}
      </FieldLabel>
      <FieldContent>
        <Select
          value={
            (form.approvalPolicy.requireApprovalSources ?? []).join(",") ||
            "none"
          }
          onValueChange={(value) =>
            updateApprovalPolicy({
              requireApprovalSources:
                value === "none"
                  ? []
                  : (value
                      .split(",")
                      .filter(
                        Boolean,
                      ) as AgentForm["approvalPolicy"]["requireApprovalSources"]),
            })
          }
        >
          <SelectTrigger id="agent-approval-sources" className="w-full">
            <SelectValue placeholder={t("sourceDefault")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">{t("sourceDefault")}</SelectItem>
            <SelectItem value="custom,mcp">{t("sourceCustomMcp")}</SelectItem>
            <SelectItem value="mcp">{t("sourceMcp")}</SelectItem>
            <SelectItem value={approvalSources.join(",")}>
              {t("sourceAll")}
            </SelectItem>
          </SelectContent>
        </Select>
      </FieldContent>
    </Field>
  );
}


export function ModelAdvancedMainSection10({
  model,
}: {
  model: ModelAdvancedFieldsViewModel;
}) {
  const { form, t, updateApprovalPolicy } = model;
  return (
    <Field>
      <FieldLabel
        htmlFor="agent-approval-risk-levels"
        help={t("approvalRiskLevelsHelp")}
      >
        {t("approvalRiskLevels")}
      </FieldLabel>
      <FieldContent>
        <Select
          value={
            (
              form.approvalPolicy.requireApprovalRiskLevels ?? [
                "high",
                "critical",
              ]
            ).join(",") || "none"
          }
          onValueChange={(value) =>
            updateApprovalPolicy({
              requireApprovalRiskLevels:
                value === "none"
                  ? []
                  : (value
                      .split(",")
                      .filter(
                        Boolean,
                      ) as AgentForm["approvalPolicy"]["requireApprovalRiskLevels"]),
            })
          }
        >
          <SelectTrigger id="agent-approval-risk-levels" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="high,critical">
              {t("riskHighCritical")}
            </SelectItem>
            <SelectItem value="medium,high,critical">
              {t("riskMediumAndAbove")}
            </SelectItem>
            <SelectItem value={approvalRiskLevels.join(",")}>
              {t("riskAll")}
            </SelectItem>
            <SelectItem value="none">{t("riskNone")}</SelectItem>
          </SelectContent>
        </Select>
      </FieldContent>
    </Field>
  );
}


export function ModelAdvancedMainSection11({
  model,
}: {
  model: ModelAdvancedFieldsViewModel;
}) {
  const { form, t, updateApprovalPolicy } = model;
  return (
    <Field>
      <FieldLabel htmlFor="agent-approval-mode" help={t("approvalPolicyHelp")}>
        {t("approvalPolicy")}
      </FieldLabel>
      <FieldContent>
        <Select
          value={
            form.approvalPolicy.requireApprovalForAllTools
              ? "all"
              : (form.approvalPolicy.defaultDecision ?? "allow")
          }
          onValueChange={(value) => {
            if (value === "all") {
              updateApprovalPolicy({
                requireApprovalForAllTools: true,
                defaultDecision: "allow",
              });
              return;
            }
            updateApprovalPolicy({
              requireApprovalForAllTools: false,
              defaultDecision: value as NonNullable<
                AgentForm["approvalPolicy"]["defaultDecision"]
              >,
            });
          }}
        >
          <SelectTrigger id="agent-approval-mode" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="allow">{t("approvalAllow")}</SelectItem>
            <SelectItem value="require_approval">
              {t("approvalDefault")}
            </SelectItem>
            <SelectItem value="deny">{t("approvalDeny")}</SelectItem>
            <SelectItem value="all">{t("approvalAll")}</SelectItem>
          </SelectContent>
        </Select>
      </FieldContent>
    </Field>
  );
}


export function ModelAdvancedMainSection12({
  model,
}: {
  model: ModelAdvancedFieldsViewModel;
}) {
  const { form, setForm, t } = model;
  return (
    <Field>
      <FieldLabel
        htmlFor="agent-response-format"
        help={t("responseFormatHelp")}
      >
        {t("responseFormat")}
      </FieldLabel>
      <FieldContent>
        <Select
          value={form.responseFormat}
          onValueChange={(value) =>
            setForm((prev) => ({
              ...prev,
              responseFormat: value as AgentForm["responseFormat"],
            }))
          }
        >
          <SelectTrigger id="agent-response-format" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="text">{t("responseText")}</SelectItem>
            <SelectItem value="json_object">{t("responseJson")}</SelectItem>
          </SelectContent>
        </Select>
      </FieldContent>
    </Field>
  );
}


export function ModelAdvancedMainSection13({
  model,
}: {
  model: ModelAdvancedFieldsViewModel;
}) {
  const { form, setForm, t } = model;
  return (
    <Field>
      <FieldLabel htmlFor="agent-tool-choice" help={t("toolChoiceHelp")}>
        {t("toolChoice")}
      </FieldLabel>
      <FieldContent>
        <Select
          value={form.toolChoice}
          onValueChange={(value) =>
            setForm((prev) => ({
              ...prev,
              toolChoice: value as AgentForm["toolChoice"],
            }))
          }
        >
          <SelectTrigger id="agent-tool-choice" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">{t("toolChoiceAuto")}</SelectItem>
            <SelectItem value="required">{t("toolChoiceRequired")}</SelectItem>
            <SelectItem value="none">{t("toolChoiceNone")}</SelectItem>
          </SelectContent>
        </Select>
      </FieldContent>
    </Field>
  );
}


export function ModelAdvancedMainSection14({
  model,
}: {
  model: ModelAdvancedFieldsViewModel;
}) {
  const { form, setForm, t } = model;
  const update = (patch: Partial<typeof form.generationSettings>) =>
    setForm((previous) => ({
      ...previous,
      generationSettings: { ...previous.generationSettings, ...patch },
    }));
  return (
    <>
      <Field>
        <FieldLabel htmlFor="agent-seed" help={t("seedHelp")}>
          {t("seed")}
        </FieldLabel>
        <FieldContent>
          <Input
            id="agent-seed"
            type="number"
            step={1}
            placeholder={t("providerDefault")}
            value={form.generationSettings.seed}
            onChange={(event) => update({ seed: event.target.value })}
          />
        </FieldContent>
      </Field>
      <Field>
        <FieldLabel htmlFor="agent-max-retries" help={t("maxRetriesHelp")}>
          {t("maxRetries")}
        </FieldLabel>
        <FieldContent>
          <Input
            id="agent-max-retries"
            type="number"
            step={1}
            placeholder={t("providerDefault")}
            value={form.generationSettings.maxRetries}
            onChange={(event) => update({ maxRetries: event.target.value })}
          />
        </FieldContent>
      </Field>
    </>
  );
}


export function ModelAdvancedMainSection15({
  model,
}: {
  model: ModelAdvancedFieldsViewModel;
}) {
  const { form, selectedModel, setForm, t } = model;
  const update = (patch: Partial<typeof form.memoryPolicy>) =>
    setForm((previous) => ({
      ...previous,
      memoryPolicy: { ...previous.memoryPolicy, ...patch },
    }));

  return (
    <>
      <Field>
        <FieldLabel
          htmlFor="agent-context-window"
          help={t("contextWindowHelp")}
        >
          {t("contextWindow")}
        </FieldLabel>
        <FieldContent>
          <Input
            id="agent-context-window"
            type="number"
            min={2000}
            step={1000}
            placeholder={
              selectedModel?.contextWindow
                ? String(selectedModel.contextWindow)
                : t("providerDefault")
            }
            value={form.memoryPolicy.contextWindowTokens}
            onChange={(event) =>
              update({ contextWindowTokens: event.target.value })
            }
          />
          <FieldDescription>
            {selectedModel?.contextWindow
              ? t("modelContextLimit", {
                  count: selectedModel.contextWindow,
                })
              : t("providerContextLimit")}
          </FieldDescription>
        </FieldContent>
      </Field>
      <Field>
        <FieldLabel
          htmlFor="agent-max-input-characters"
          help={t("maxInputCharactersHelp")}
        >
          {t("maxInputCharacters")}
        </FieldLabel>
        <FieldContent>
          <Input
            id="agent-max-input-characters"
            type="number"
            min={1}
            max={200000}
            step={1000}
            value={form.memoryPolicy.maxInputCharacters}
            onChange={(event) =>
              update({ maxInputCharacters: event.target.value })
            }
          />
        </FieldContent>
      </Field>
      <Field>
        <FieldLabel
          htmlFor="agent-history-message-limit"
          help={t("historyMessageLimitHelp")}
        >
          {t("historyMessageLimit")}
        </FieldLabel>
        <FieldContent>
          <Input
            id="agent-history-message-limit"
            type="number"
            min={2}
            step={2}
            placeholder={t("unlimited")}
            value={form.memoryPolicy.maxMessages}
            onChange={(event) => update({ maxMessages: event.target.value })}
          />
        </FieldContent>
      </Field>
      <Field>
        <FieldLabel
          htmlFor="agent-summary-max-tokens"
          help={t("summaryMaxTokensHelp")}
        >
          {t("summaryMaxTokens")}
        </FieldLabel>
        <FieldContent>
          <Input
            id="agent-summary-max-tokens"
            type="number"
            min={128}
            max={16000}
            step={100}
            value={form.memoryPolicy.summaryMaxTokens}
            onChange={(event) =>
              update({ summaryMaxTokens: event.target.value })
            }
          />
        </FieldContent>
      </Field>
    </>
  );
}


export function ModelAdvancedFieldsSection1({
  model,
}: {
  model: ModelAdvancedFieldsViewModel;
}) {
  const { form, selectedModel, setForm, t, toolOptions, updateApprovalPolicy } =
    model;
  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-border/70 bg-card/55 p-4">
        <div className="mb-4 flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <SlidersHorizontalIcon className="size-4" aria-hidden="true" />
          </span>
          <div>
            <h3 className="text-sm font-semibold">{t("generationSection")}</h3>
            <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
              {t("generationSectionHint")}
            </p>
          </div>
        </div>
        <FieldGroup className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="agent-temperature" help={t("temperatureHelp")}>
              {t("temperature")}
            </FieldLabel>
            <FieldContent>
              <Input
                id="agent-temperature"
                type="number"
                step={0.1}
                value={form.temperature}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, temperature: e.target.value }))
                }
              />
            </FieldContent>
          </Field>
          <Field>
            <FieldLabel htmlFor="agent-top-p" help={t("topPHelp")}>
              {t("topP")}
            </FieldLabel>
            <FieldContent>
              <Input
                id="agent-top-p"
                type="number"
                step={0.1}
                value={form.topP}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, topP: e.target.value }))
                }
              />
            </FieldContent>
          </Field>
          <Field>
            <FieldLabel
              htmlFor="agent-max-output"
              help={t("maxOutputTokensHelp")}
            >
              {t("maxOutputTokens")}
            </FieldLabel>
            <FieldContent>
              <Input
                id="agent-max-output"
                type="number"
                value={form.maxOutputTokens}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    maxOutputTokens: e.target.value,
                  }))
                }
              />
              <FieldDescription>
                {selectedModel?.maxOutputTokens
                  ? t("modelOutputLimit", {
                      count: selectedModel.maxOutputTokens,
                    })
                  : t("providerOutputLimit")}
              </FieldDescription>
            </FieldContent>
          </Field>
          <Field>
            <FieldLabel
              htmlFor="agent-max-tool-calls"
              help={t("maxToolCallsHelp")}
            >
              {t("maxToolCalls")}
            </FieldLabel>
            <FieldContent>
              <Input
                id="agent-max-tool-calls"
                type="number"
                value={form.maxToolCalls}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    maxToolCalls: e.target.value,
                  }))
                }
              />
            </FieldContent>
          </Field>
          <ReasoningPresetsField model={model} />
          <ModelAdvancedMainSection13 model={model} />
          <ModelAdvancedMainSection12 model={model} />
          <ModelAdvancedMainSection6 model={model} />
          <ModelAdvancedMainSection5 model={model} />
          <ModelAdvancedMainSection4 model={model} />
          <ModelAdvancedMainSection14 model={model} />
          <ModelAdvancedMainSection1 model={model} />
        </FieldGroup>
      </section>
      <section className="rounded-2xl border border-border/70 bg-card/55 p-4">
        <div className="mb-4 flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-warning/10 text-warning">
            <ShieldCheckIcon className="size-4" aria-hidden="true" />
          </span>
          <div>
            <h3 className="text-sm font-semibold">{t("toolPolicySection")}</h3>
            <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
              {t("toolPolicySectionHint")}
            </p>
          </div>
        </div>
        <FieldGroup className="grid gap-4 sm:grid-cols-2">
          <ModelAdvancedMainSection11 model={model} />
          <ModelAdvancedMainSection10 model={model} />
          <ModelAdvancedMainSection9 model={model} />
          <Field className="sm:col-span-2">
            <FieldLabel>{t("toolRules")}</FieldLabel>
            <FieldContent>
              <ToolPolicyPicker
                options={toolOptions}
                approvalNames={
                  form.approvalPolicy.requireApprovalToolNames ?? []
                }
                deniedNames={form.approvalPolicy.denyToolNames ?? []}
                onChange={({ approvalNames, deniedNames }) =>
                  updateApprovalPolicy({
                    requireApprovalToolNames: approvalNames,
                    denyToolNames: deniedNames,
                  })
                }
                labels={{
                  empty: t("noEnabledTools"),
                  approval: t("alwaysApproveTools"),
                  denied: t("deniedTools"),
                  builtin: t("toolSourceBuiltin"),
                  custom: t("toolSourceCustom"),
                  mcp: t("toolSourceMcp"),
                }}
              />
            </FieldContent>
          </Field>
        </FieldGroup>
      </section>
      <section className="rounded-2xl border border-border/70 bg-card/55 p-4">
        <div className="mb-4 flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <BrainCircuitIcon className="size-4" aria-hidden="true" />
          </span>
          <div>
            <h3 className="text-sm font-semibold">
              {t("memorySafetySection")}
            </h3>
            <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
              {t("memorySafetySectionHint")}
            </p>
          </div>
        </div>
        <FieldGroup className="grid gap-4 sm:grid-cols-2">
          <ModelAdvancedMainSection8 model={model} />
          <ModelAdvancedMainSection7 model={model} />
          <ModelAdvancedMainSection15 model={model} />
          <ModelAdvancedMainSection3 model={model} />
          <ModelAdvancedMainSection2 model={model} />
        </FieldGroup>
      </section>
    </div>
  );
}

