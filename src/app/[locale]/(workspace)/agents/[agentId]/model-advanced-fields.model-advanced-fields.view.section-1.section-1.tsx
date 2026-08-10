import { Field, FieldContent, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";

import type { ModelAdvancedFieldsViewModel } from "./model-advanced-fields.model-advanced-fields.view";
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
