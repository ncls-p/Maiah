import { Field,FieldContent,FieldLabel } from "@/components/ui/field";
import { Select,SelectContent,SelectItem,SelectTrigger,SelectValue } from "@/components/ui/select";

import type { ModelAdvancedFieldsViewModel } from "./model-advanced-fields.model-advanced-fields.view";
import type { AgentForm } from "./types";
export function ModelAdvancedMainSection13({ model }: { model: ModelAdvancedFieldsViewModel }) {
  const { form, setForm, t } = model;
  return (
    <Field>
      <FieldLabel htmlFor="agent-tool-choice" help={t("toolChoiceHelp")}>
        {t("toolChoice")}
      </FieldLabel>
      <FieldContent>
        <Select
          value={form.toolChoice}
          onValueChange={(value) =>
            setForm((prev) => ({
              ...prev,
              toolChoice: value as AgentForm["toolChoice"],
            }))
          }
        >
          <SelectTrigger id="agent-tool-choice" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">{t("toolChoiceAuto")}</SelectItem>
            <SelectItem value="required">{t("toolChoiceRequired")}</SelectItem>
            <SelectItem value="none">{t("toolChoiceNone")}</SelectItem>
          </SelectContent>
        </Select>
      </FieldContent>
    </Field>
  );
}
