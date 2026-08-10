import { Field, FieldContent, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type { ModelAdvancedFieldsViewModel } from "./model-advanced-fields.model-advanced-fields.view";
import type { AgentForm } from "./types";
export function ModelAdvancedMainSection12({
  model,
}: {
  model: ModelAdvancedFieldsViewModel;
}) {
  const { form, setForm, t } = model;
  return (
    <Field>
      <FieldLabel
        htmlFor="agent-response-format"
        help={t("responseFormatHelp")}
      >
        {t("responseFormat")}
      </FieldLabel>
      <FieldContent>
        <Select
          value={form.responseFormat}
          onValueChange={(value) =>
            setForm((prev) => ({
              ...prev,
              responseFormat: value as AgentForm["responseFormat"],
            }))
          }
        >
          <SelectTrigger id="agent-response-format" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="text">{t("responseText")}</SelectItem>
            <SelectItem value="json_object">{t("responseJson")}</SelectItem>
          </SelectContent>
        </Select>
      </FieldContent>
    </Field>
  );
}
