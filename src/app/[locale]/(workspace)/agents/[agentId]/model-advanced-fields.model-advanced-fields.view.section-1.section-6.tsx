import { Field,FieldContent,FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

import type { ModelAdvancedFieldsViewModel } from "./model-advanced-fields.model-advanced-fields.view";
export function ModelAdvancedMainSection6({ model }: { model: ModelAdvancedFieldsViewModel }) {
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
          min={1}
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
