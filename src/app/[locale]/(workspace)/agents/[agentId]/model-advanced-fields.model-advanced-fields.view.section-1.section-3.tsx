import { Field,FieldContent,FieldLabel } from "@/components/ui/field";
import { Select,SelectContent,SelectItem,SelectTrigger,SelectValue } from "@/components/ui/select";

import type { ModelAdvancedFieldsViewModel } from "./model-advanced-fields.model-advanced-fields.view";
export function ModelAdvancedMainSection3({ model }: { model: ModelAdvancedFieldsViewModel }) {
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
