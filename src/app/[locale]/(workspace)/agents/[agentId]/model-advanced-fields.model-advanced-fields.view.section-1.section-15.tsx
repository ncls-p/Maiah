import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";

import type { ModelAdvancedFieldsViewModel } from "./model-advanced-fields.model-advanced-fields.view";

export function ModelAdvancedMainSection15({
  model,
}: {
  model: ModelAdvancedFieldsViewModel;
}) {
  const { form, selectedModel, setForm, t } = model;
  const update = (patch: Partial<typeof form.memoryPolicy>) =>
    setForm((previous) => ({
      ...previous,
      memoryPolicy: { ...previous.memoryPolicy, ...patch },
    }));

  return (
    <>
      <Field>
        <FieldLabel
          htmlFor="agent-context-window"
          help={t("contextWindowHelp")}
        >
          {t("contextWindow")}
        </FieldLabel>
        <FieldContent>
          <Input
            id="agent-context-window"
            type="number"
            min={0}
            step={1000}
            placeholder={
              selectedModel?.contextWindow
                ? String(selectedModel.contextWindow)
                : t("providerDefault")
            }
            value={form.memoryPolicy.contextWindowTokens}
            onChange={(event) =>
              update({ contextWindowTokens: event.target.value })
            }
          />
          <FieldDescription>
            {selectedModel?.contextWindow
              ? t("modelContextLimit", {
                  count: selectedModel.contextWindow,
                })
              : t("providerContextLimit")}
          </FieldDescription>
        </FieldContent>
      </Field>
      <Field>
        <FieldLabel
          htmlFor="agent-max-input-characters"
          help={t("maxInputCharactersHelp")}
        >
          {t("maxInputCharacters")}
        </FieldLabel>
        <FieldContent>
          <Input
            id="agent-max-input-characters"
            type="number"
            min={1}
            max={200000}
            step={1000}
            value={form.memoryPolicy.maxInputCharacters}
            onChange={(event) =>
              update({ maxInputCharacters: event.target.value })
            }
          />
        </FieldContent>
      </Field>
      <Field>
        <FieldLabel
          htmlFor="agent-history-message-limit"
          help={t("historyMessageLimitHelp")}
        >
          {t("historyMessageLimit")}
        </FieldLabel>
        <FieldContent>
          <Input
            id="agent-history-message-limit"
            type="number"
            min={2}
            step={2}
            placeholder={t("unlimited")}
            value={form.memoryPolicy.maxMessages}
            onChange={(event) => update({ maxMessages: event.target.value })}
          />
        </FieldContent>
      </Field>
      <Field>
        <FieldLabel
          htmlFor="agent-summary-max-tokens"
          help={t("summaryMaxTokensHelp")}
        >
          {t("summaryMaxTokens")}
        </FieldLabel>
        <FieldContent>
          <Input
            id="agent-summary-max-tokens"
            type="number"
            min={128}
            max={16000}
            step={100}
            value={form.memoryPolicy.summaryMaxTokens}
            onChange={(event) =>
              update({ summaryMaxTokens: event.target.value })
            }
          />
        </FieldContent>
      </Field>
    </>
  );
}
