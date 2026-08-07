import { Field, FieldContent, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

import type { ModelAdvancedFieldsViewModel } from "./model-advanced-fields.model-advanced-fields.view";

export function ModelAdvancedMainSection14({
  model,
}: {
  model: ModelAdvancedFieldsViewModel;
}) {
  const { form, setForm, t } = model;
  const update = (patch: Partial<typeof form.generationSettings>) =>
    setForm((previous) => ({
      ...previous,
      generationSettings: { ...previous.generationSettings, ...patch },
    }));
  return (
    <>
      <Field>
        <FieldLabel htmlFor="agent-seed" help={t("seedHelp")}>
          {t("seed")}
        </FieldLabel>
        <FieldContent>
          <Input
            id="agent-seed"
            type="number"
            step={1}
            placeholder={t("providerDefault")}
            value={form.generationSettings.seed}
            onChange={(event) => update({ seed: event.target.value })}
          />
        </FieldContent>
      </Field>
      <Field>
        <FieldLabel htmlFor="agent-max-retries" help={t("maxRetriesHelp")}>
          {t("maxRetries")}
        </FieldLabel>
        <FieldContent>
          <Input
            id="agent-max-retries"
            type="number"
            min={0}
            step={1}
            placeholder={t("providerDefault")}
            value={form.generationSettings.maxRetries}
            onChange={(event) => update({ maxRetries: event.target.value })}
          />
        </FieldContent>
      </Field>
    </>
  );
}
