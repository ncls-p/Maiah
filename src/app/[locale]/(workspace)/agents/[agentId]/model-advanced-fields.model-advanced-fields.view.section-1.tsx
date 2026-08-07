import {
  BrainCircuitIcon,
  ShieldCheckIcon,
  SlidersHorizontalIcon,
} from "lucide-react";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { agentRuntimePolicy } from "@/modules/agent/runtime-policy";

import { ToolPolicyPicker } from "./model-advanced-fields.tool-policy-picker";
import type { ModelAdvancedFieldsViewModel } from "./model-advanced-fields.model-advanced-fields.view";
import { ModelAdvancedMainSection1 } from "./model-advanced-fields.model-advanced-fields.view.section-1.section-1";
import { ModelAdvancedMainSection10 } from "./model-advanced-fields.model-advanced-fields.view.section-1.section-10";
import { ModelAdvancedMainSection11 } from "./model-advanced-fields.model-advanced-fields.view.section-1.section-11";
import { ModelAdvancedMainSection12 } from "./model-advanced-fields.model-advanced-fields.view.section-1.section-12";
import { ModelAdvancedMainSection13 } from "./model-advanced-fields.model-advanced-fields.view.section-1.section-13";
import { ModelAdvancedMainSection14 } from "./model-advanced-fields.model-advanced-fields.view.section-1.section-14";
import { ModelAdvancedMainSection2 } from "./model-advanced-fields.model-advanced-fields.view.section-1.section-2";
import { ModelAdvancedMainSection3 } from "./model-advanced-fields.model-advanced-fields.view.section-1.section-3";
import { ModelAdvancedMainSection4 } from "./model-advanced-fields.model-advanced-fields.view.section-1.section-4";
import { ModelAdvancedMainSection5 } from "./model-advanced-fields.model-advanced-fields.view.section-1.section-5";
import { ModelAdvancedMainSection6 } from "./model-advanced-fields.model-advanced-fields.view.section-1.section-6";
import { ModelAdvancedMainSection7 } from "./model-advanced-fields.model-advanced-fields.view.section-1.section-7";
import { ModelAdvancedMainSection8 } from "./model-advanced-fields.model-advanced-fields.view.section-1.section-8";
import { ModelAdvancedMainSection9 } from "./model-advanced-fields.model-advanced-fields.view.section-1.section-9";

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
                min={0}
                max={2}
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
                min={0}
                max={1}
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
                min={1}
                max={selectedModel?.maxOutputTokens ?? undefined}
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
                min={0}
                max={agentRuntimePolicy.maxToolCalls}
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
          <ModelAdvancedMainSection3 model={model} />
          <ModelAdvancedMainSection2 model={model} />
        </FieldGroup>
      </section>
    </div>
  );
}
