import { Field,FieldContent,FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

import type { ModelAdvancedFieldsViewModel } from "./model-advanced-fields.model-advanced-fields.view";
export function ModelAdvancedMainSection7({ model }: { model: ModelAdvancedFieldsViewModel }) {
  const { form, setForm, t } = model;
  return (
    <Field>
      <FieldLabel htmlFor="agent-memory-max-messages" help={t("memoryMaxMessagesHelp")}>
        {t("memoryMaxMessages")}
      </FieldLabel>
      <FieldContent>
        <Input
          id="agent-memory-max-messages"
          type="number"
          min={1}
          value={form.memoryPolicy.maxMessages}
          onChange={(e) =>
            setForm((prev) => ({
              ...prev,
              memoryPolicy: {
                ...prev.memoryPolicy,
                maxMessages: Number(e.target.value) || 1,
              },
            }))
          }
        />
      </FieldContent>
    </Field>
  );
}
