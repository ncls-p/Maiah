"use client";

import { useTranslations } from "next-intl";

import { ModelAdvancedFieldsView } from "./model-advanced-fields.model-advanced-fields.view";
import type { AgentForm, AgentToolPolicyOption, Model } from "./types";
import { defaultGenParams } from "./types";

export function useModelAdvancedFieldsController({
  form,
  setFormAction: setForm,
  toolOptions = [],
  selectedModel,
  onResetAction: onReset,
}: {
  form: AgentForm;
  setFormAction: (fn: (prev: AgentForm) => AgentForm) => void;
  toolOptions?: AgentToolPolicyOption[];
  selectedModel?: Model;
  onResetAction?: () => void;
}) {
  const t = useTranslations("agents.model");

  function updateApprovalPolicy(patch: Partial<AgentForm["approvalPolicy"]>) {
    setForm((prev) => ({
      ...prev,
      approvalPolicy: {
        ...prev.approvalPolicy,
        ...patch,
      },
    }));
  }

  function resetGenParams() {
    setForm((prev) => ({
      ...prev,
      temperature: defaultGenParams.temperature,
      topP: defaultGenParams.topP,
      maxOutputTokens: defaultGenParams.maxOutputTokens,
      maxToolCalls: defaultGenParams.maxToolCalls,
      toolChoice: "auto",
      generationSettings: {
        topK: "",
        presencePenalty: "",
        frequencyPenalty: "",
        seed: "",
        maxRetries: "",
        stopSequences: "",
        reasoningPresets: [],
      },
      responseFormat: "text",
    }));
    onReset?.();
  }

  return {
    kind: "ready",
    form,
    resetGenParams,
    selectedModel,
    setForm,
    t,
    toolOptions,
    updateApprovalPolicy,
  } as const;
}

export function ModelAdvancedFields(
  ...args: Parameters<typeof useModelAdvancedFieldsController>
) {
  const model = useModelAdvancedFieldsController(...args);
  if (!("kind" in model)) return model;
  return <ModelAdvancedFieldsView model={model} />;
}
