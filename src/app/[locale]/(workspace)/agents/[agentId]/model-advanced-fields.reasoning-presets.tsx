import { BrainCircuitIcon } from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
} from "@/components/ui/field";
import {
  REASONING_PRESETS,
  type ReasoningPreset,
} from "@/modules/agent/reasoning-presets";
import type { ModelAdvancedFieldsViewModel } from "./model-advanced-fields.model-advanced-fields.view";

export function ReasoningPresetsField({
  model,
}: {
  model: ModelAdvancedFieldsViewModel;
}) {
  const { form, setForm, t } = model;

  function toggle(preset: ReasoningPreset, checked: boolean) {
    setForm((previous) => {
      const selected = new Set(previous.generationSettings.reasoningPresets);
      if (checked) selected.add(preset);
      else selected.delete(preset);
      return {
        ...previous,
        generationSettings: {
          ...previous.generationSettings,
          reasoningPresets: REASONING_PRESETS.filter((item) =>
            selected.has(item),
          ),
        },
      };
    });
  }

  return (
    <Field className="sm:col-span-2">
      <FieldLabel>{t("reasoningPresets")}</FieldLabel>
      <FieldContent>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {REASONING_PRESETS.map((preset) => {
            const checked =
              form.generationSettings.reasoningPresets.includes(preset);
            return (
              <label
                key={preset}
                className="flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border border-border/65 bg-background/60 px-3 text-sm transition-[border-color,background-color,color] has-checked:border-primary/40 has-checked:bg-primary/8 has-checked:text-foreground"
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={(value) => toggle(preset, value === true)}
                  aria-label={t("reasoningPresetLabel", {
                    level: t(`reasoningLevels.${preset}`),
                  })}
                />
                <span className="truncate">
                  {t(`reasoningLevels.${preset}`)}
                </span>
              </label>
            );
          })}
        </div>
        <FieldDescription className="flex items-start gap-1.5">
          <BrainCircuitIcon
            className="mt-0.5 size-3.5 shrink-0"
            aria-hidden="true"
          />
          {t("reasoningPresetsHelp")}
        </FieldDescription>
      </FieldContent>
    </Field>
  );
}
