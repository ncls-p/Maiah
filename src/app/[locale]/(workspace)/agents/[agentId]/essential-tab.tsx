"use client";

import { useTranslations } from "next-intl";
import type { SyntheticEvent } from "react";

import { EssentialTabView } from "./essential-tab.view";
import type {
  Agent,
  AgentForm,
  AgentToolPolicyOption,
  Model,
  Provider,
} from "./types";

export function useEssentialTabController({
  form,
  setFormAction: setForm,
  providers,
  models,
  toolOptions,
  saving,
  canAdminCurate,
  canManageProviders,
  agentKind,
  accessOptions,
  readOnly = false,
  onSaveAction: onSave,
}: {
  form: AgentForm;
  setFormAction: (fn: (prev: AgentForm) => AgentForm) => void;
  providers: Provider[];
  models: Model[];
  toolOptions: AgentToolPolicyOption[];
  saving: boolean;
  canAdminCurate: boolean;
  canManageProviders: boolean;
  agentKind: Agent["kind"];
  accessOptions: Agent["accessOptions"];
  readOnly?: boolean;
  onSaveAction: (e: SyntheticEvent<HTMLFormElement>) => void;
}) {
  const t = useTranslations("agents");
  const tModel = useTranslations("agents.model");
  const tCommon = useTranslations("common");
  const filteredModels = models.filter((m) => m.providerId === form.providerId);
  const hasProviders = providers.length > 0;
  const selectedProviderHasModels =
    !form.providerId || filteredModels.length > 0;
  const selectedModel = models.find((model) => model.id === form.modelId);

  return {
    kind: "ready",
    agentKind,
    accessOptions,
    canAdminCurate,
    canManageProviders,
    filteredModels,
    form,
    hasProviders,
    onSave,
    providers,
    readOnly,
    saving,
    selectedModel,
    selectedProviderHasModels,
    setForm,
    t,
    tCommon,
    tModel,
    toolOptions,
  } as const;
}

export function EssentialTab(
  ...args: Parameters<typeof useEssentialTabController>
) {
  const model = useEssentialTabController(...args);
  if (!("kind" in model)) return model;
  return <EssentialTabView model={model} />;
}
