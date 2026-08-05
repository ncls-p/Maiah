"use client";

import { useTranslations } from "next-intl";
import type { SyntheticEvent } from "react";

import { EssentialTabView } from "./essential-tab.view";
import type { Agent,AgentForm,Model,Provider } from "./types";

export function useEssentialTabController({ form, setFormAction: setForm, providers, models, saving, canAdminCurate, canManageProviders, agentKind, readOnly = false, onSaveAction: onSave }: { form: AgentForm; setFormAction: (fn: (prev: AgentForm) => AgentForm) => void; providers: Provider[]; models: Model[]; saving: boolean; canAdminCurate: boolean; canManageProviders: boolean; agentKind: Agent["kind"]; readOnly?: boolean; onSaveAction: (e: SyntheticEvent<HTMLFormElement>) => void }) {
  const t = useTranslations("agents");
  const tModel = useTranslations("agents.model");
  const tCommon = useTranslations("common");
  const filteredModels = models.filter((m) => m.providerId === form.providerId);
  const hasProviders = providers.length > 0;
  const selectedProviderHasModels = !form.providerId || filteredModels.length > 0;

  return {
    kind: "ready",
    agentKind,
    canAdminCurate,
    canManageProviders,
    filteredModels,
    form,
    hasProviders,
    onSave,
    providers,
    readOnly,
    saving,
    selectedProviderHasModels,
    setForm,
    t,
    tCommon,
    tModel,
  } as const;
}

export function EssentialTab(...args: Parameters<typeof useEssentialTabController>) {
  const model = useEssentialTabController(...args);
  if (!("kind" in model)) return model;
  return <EssentialTabView model={model} />;
}
