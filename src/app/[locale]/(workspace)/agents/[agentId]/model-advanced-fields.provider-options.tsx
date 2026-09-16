import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
} from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { generationSettingsSchema } from "@/modules/agent/generation-settings";
import type { ModelAdvancedFieldsViewModel } from "./model-advanced-fields.model-advanced-fields.view";

export function ProviderOptionsField({
  model,
}: {
  model: ModelAdvancedFieldsViewModel;
}) {
  const { form, setForm, t } = model;
  const value = form.generationSettings.providerOptions ?? "";
  let invalid = false;
  if (value.trim()) {
    try {
      invalid = !generationSettingsSchema.safeParse({
        providerOptions: JSON.parse(value),
      }).success;
    } catch {
      invalid = true;
    }
  }
  return (
    <Field className="sm:col-span-2">
      <FieldLabel
        htmlFor="agent-provider-options"
        help={t("providerOptionsHelp")}
      >
        provider_options
      </FieldLabel>
      <FieldContent>
        <Textarea
          id="agent-provider-options"
          className="font-mono text-xs"
          rows={5}
          value={value}
          spellCheck={false}
          aria-invalid={invalid}
          aria-describedby="agent-provider-options-help"
          placeholder={
            '{ "openai": { "textVerbosity": "low", "parallelToolCalls": false } }'
          }
          onChange={(event) =>
            setForm((previous) => ({
              ...previous,
              generationSettings: {
                ...previous.generationSettings,
                providerOptions: event.target.value,
              },
            }))
          }
        />
        {!!form.excludedGenerationSettings?.length && (
          <FieldDescription role="status">
            {t("excludedGenerationSettings", {
              settings: form.excludedGenerationSettings.join(", "),
            })}
          </FieldDescription>
        )}
        <FieldDescription id="agent-provider-options-help">
          {t(invalid ? "providerOptionsInvalid" : "providerOptionsHint")}
        </FieldDescription>
      </FieldContent>
    </Field>
  );
}
