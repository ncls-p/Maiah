import { Field, FieldContent, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

import type { ModelAdvancedFieldsViewModel } from "./model-advanced-fields.model-advanced-fields.view";
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
