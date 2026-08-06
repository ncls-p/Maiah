import { Field,FieldContent,FieldGroup,FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { agentRuntimePolicy } from "@/modules/agent/runtime-policy";

import { parseTextList } from "./model-advanced-fields.approval-risk-levels";
import type { ModelAdvancedFieldsViewModel } from "./model-advanced-fields.model-advanced-fields.view";
import { ModelAdvancedMainSection1 } from "./model-advanced-fields.model-advanced-fields.view.section-1.section-1";
import { ModelAdvancedMainSection10 } from "./model-advanced-fields.model-advanced-fields.view.section-1.section-10";
import { ModelAdvancedMainSection11 } from "./model-advanced-fields.model-advanced-fields.view.section-1.section-11";
import { ModelAdvancedMainSection12 } from "./model-advanced-fields.model-advanced-fields.view.section-1.section-12";
import { ModelAdvancedMainSection13 } from "./model-advanced-fields.model-advanced-fields.view.section-1.section-13";
import { ModelAdvancedMainSection2 } from "./model-advanced-fields.model-advanced-fields.view.section-1.section-2";
import { ModelAdvancedMainSection3 } from "./model-advanced-fields.model-advanced-fields.view.section-1.section-3";
import { ModelAdvancedMainSection4 } from "./model-advanced-fields.model-advanced-fields.view.section-1.section-4";
import { ModelAdvancedMainSection5 } from "./model-advanced-fields.model-advanced-fields.view.section-1.section-5";
import { ModelAdvancedMainSection6 } from "./model-advanced-fields.model-advanced-fields.view.section-1.section-6";
import { ModelAdvancedMainSection7 } from "./model-advanced-fields.model-advanced-fields.view.section-1.section-7";
import { ModelAdvancedMainSection8 } from "./model-advanced-fields.model-advanced-fields.view.section-1.section-8";
import { ModelAdvancedMainSection9 } from "./model-advanced-fields.model-advanced-fields.view.section-1.section-9";

export function ModelAdvancedFieldsSection1({ model }: { model: ModelAdvancedFieldsViewModel }) {
  const { form, setForm, t, updateApprovalPolicy } = model;
  return (
    <FieldGroup className="grid gap-4 sm:grid-cols-2">
      <Field>
        <FieldLabel htmlFor="agent-temperature" help={t("temperatureHelp")}>
          {t("temperature")}
        </FieldLabel>
        <FieldContent>
          <Input id="agent-temperature" type="number" min={0} max={2} step={0.1} value={form.temperature} onChange={(e) => setForm((prev) => ({ ...prev, temperature: e.target.value }))} />
        </FieldContent>
      </Field>
      <Field>
        <FieldLabel htmlFor="agent-top-p" help={t("topPHelp")}>
          {t("topP")}
        </FieldLabel>
        <FieldContent>
          <Input id="agent-top-p" type="number" min={0} max={1} step={0.1} value={form.topP} onChange={(e) => setForm((prev) => ({ ...prev, topP: e.target.value }))} />
        </FieldContent>
      </Field>
      <Field>
        <FieldLabel htmlFor="agent-max-output" help={t("maxOutputTokensHelp")}>
          {t("maxOutputTokens")}
        </FieldLabel>
        <FieldContent>
          <Input
            id="agent-max-output"
            type="number"
            min={1}
            max={agentRuntimePolicy.maxOutputTokens}
            value={form.maxOutputTokens}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                maxOutputTokens: e.target.value,
              }))
            }
          />
        </FieldContent>
      </Field>
      <Field>
        <FieldLabel htmlFor="agent-max-tool-calls" help={t("maxToolCallsHelp")}>
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
      <ModelAdvancedMainSection11 model={model} />
      <ModelAdvancedMainSection10 model={model} />
      <ModelAdvancedMainSection9 model={model} />
      <Field className="sm:col-span-2">
        <FieldLabel htmlFor="agent-approval-tool-names">{t("alwaysApproveTools")}</FieldLabel>
        <FieldContent>
          <Textarea
            id="agent-approval-tool-names"
            placeholder={t("oneToolPerLine")}
            value={(form.approvalPolicy.requireApprovalToolNames ?? []).join("\n")}
            onChange={(e) =>
              updateApprovalPolicy({
                requireApprovalToolNames: parseTextList(e.target.value),
              })
            }
          />
        </FieldContent>
      </Field>
      <Field className="sm:col-span-2">
        <FieldLabel htmlFor="agent-denied-tool-names">{t("deniedTools")}</FieldLabel>
        <FieldContent>
          <Textarea
            id="agent-denied-tool-names"
            placeholder={t("oneToolPerLine")}
            value={(form.approvalPolicy.denyToolNames ?? []).join("\n")}
            onChange={(e) =>
              updateApprovalPolicy({
                denyToolNames: parseTextList(e.target.value),
              })
            }
          />
        </FieldContent>
      </Field>
      <ModelAdvancedMainSection8 model={model} />
      <ModelAdvancedMainSection7 model={model} />
      <ModelAdvancedMainSection6 model={model} />
      <ModelAdvancedMainSection5 model={model} />
      <ModelAdvancedMainSection4 model={model} />
      <ModelAdvancedMainSection3 model={model} />
      <ModelAdvancedMainSection2 model={model} />
      <ModelAdvancedMainSection1 model={model} />
    </FieldGroup>
  );
}
