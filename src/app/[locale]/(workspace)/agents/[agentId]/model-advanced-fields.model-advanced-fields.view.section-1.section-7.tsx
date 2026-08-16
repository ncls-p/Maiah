import { Field, FieldContent, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

import type { ModelAdvancedFieldsViewModel } from "./model-advanced-fields.model-advanced-fields.view";
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
