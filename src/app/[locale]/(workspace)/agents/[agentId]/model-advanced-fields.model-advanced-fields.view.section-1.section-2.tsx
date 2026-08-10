import { Field, FieldContent, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";

import type { ModelAdvancedFieldsViewModel } from "./model-advanced-fields.model-advanced-fields.view";
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
