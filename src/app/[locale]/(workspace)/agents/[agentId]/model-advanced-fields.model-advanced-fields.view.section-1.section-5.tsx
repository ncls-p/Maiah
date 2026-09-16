import { Field, FieldContent, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

import type { ModelAdvancedFieldsViewModel } from "./model-advanced-fields.model-advanced-fields.view";
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
        {"presence_penalty"}
      </FieldLabel>
      <FieldContent>
        <Input
          id="agent-presence-penalty"
          type="number"
          step="any"
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
