import { Field, FieldContent, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type { ModelAdvancedFieldsViewModel } from "./model-advanced-fields.model-advanced-fields.view";
export function ModelAdvancedMainSection8({
  model,
}: {
  model: ModelAdvancedFieldsViewModel;
}) {
  const { form, setForm, t } = model;
  return (
    <Field>
      <FieldLabel htmlFor="agent-memory-enabled" help={t("memoryHelp")}>
        {t("memory")}
      </FieldLabel>
      <FieldContent>
        <Select
          value={form.memoryPolicy.enabled ? "enabled" : "disabled"}
          onValueChange={(value) =>
            setForm((prev) => ({
              ...prev,
              memoryPolicy: {
                ...prev.memoryPolicy,
                enabled: value === "enabled",
              },
            }))
          }
        >
          <SelectTrigger id="agent-memory-enabled" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="disabled">{t("memoryDisabled")}</SelectItem>
            <SelectItem value="enabled">{t("memoryEnabled")}</SelectItem>
          </SelectContent>
        </Select>
      </FieldContent>
    </Field>
  );
}
