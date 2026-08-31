"use client";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { DiscoveredModel } from "@/components/providers/provider-manager/types";
import { useWorkspace } from "@/hooks/use-workspace";
import { fetchJson } from "@/lib/api-client";
import { ONBOARDING_TOOL_PRESET } from "@/modules/agent/onboarding-tools";
import { ProviderModel, ProviderSummary, SetupWizardProps, StepId, defaultAuthType, slugify, SetupStepper, BUTTON_TYPE, OUTLINE_VARIANT, ModelMetadata, ProviderKind } from "./setup-wizard.button-type";
import { createSetupProviderForm } from "./setup-wizard.provider-form";
import { SetupWizardLoadError, SetupWizardLoading } from "./setup-wizard.status";
import { useSetupWizardCatalog } from "./setup-wizard.use-catalog";
import { Link } from "@/i18n/navigation";
import { Loader2, MessageSquareIcon, CheckCircle2Icon, PlugZapIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { type OpenAICompatibleApiRoute } from "@/lib/openai-compatible-api";

export function useSetupWizardController({
  mode = "page",
  initialAgentId = null,
  onCompleteAction,
  onCancelAction,
}: SetupWizardProps) {
  const t = useTranslations("setup");
  const { workspaceId } = useWorkspace();
  const [step, setStep] = useState<StepId>("provider");
  const [providers, setProviders] = useState<ProviderSummary[]>([]);
  const [providerId, setProviderId] = useState<string | null>(null);
  const [modelDbId, setModelDbId] = useState<string | null>(null);
  const [agentId, setAgentId] = useState<string | null>(initialAgentId);
  const [busy, setBusy] = useState(false);
  const [loadingProviders, setLoadingProviders] = useState(true);
  const [providersLoadError, setProvidersLoadError] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelsLoadError, setModelsLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [models, setModels] = useState<ProviderModel[]>([]);
  const [discoveredModels, setDiscoveredModels] = useState<DiscoveredModel[]>(
    [],
  );
  const [providerForm, setProviderForm] = useState(() =>
    createSetupProviderForm(t("defaultProviderName")),
  );
  const [manualModelId, setManualModelId] = useState("");
  const [agentForm, setAgentForm] = useState({
    name: t("defaultAssistantName"),
  });

  useSetupWizardCatalog({
    workspaceId,
    providerId,
    loadAttempt,
    setLoadingProviders,
    setProvidersLoadError,
    setProviders,
    setProviderId,
    setStep,
    setLoadingModels,
    setModelsLoadError,
    setModels,
    setDiscoveredModels,
    setModelDbId,
  });

  async function createProvider() {
    if (!workspaceId) return;
    setBusy(true);
    try {
      const provider = await fetchJson<ProviderSummary>(
        "/api/workspace/providers",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspaceId,
            name: providerForm.name,
            kind: providerForm.kind,
            authType: defaultAuthType(providerForm.kind),
            baseUrl: providerForm.baseUrl || undefined,
            apiKey: providerForm.apiKey || undefined,
            ...(providerForm.kind === "openai-compatible"
              ? {
                  openaiCompatibleApiRoute:
                    providerForm.openaiCompatibleApiRoute,
                }
              : {}),
          }),
        },
      );
      setProviders((current) => [provider, ...current]);
      setProviderId(provider.id);
      setStep("model");
      toast.success(t("toasts.providerSaved"));
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("toasts.providerCreateFailed"),
      );
      return;
    } finally {
      setBusy(false);
    }
  }

  async function addAndSelectModel() {
    const modelId = manualModelId.trim();
    const displayName = modelId;
    if (!workspaceId) return;
    if (!providerId) return;
    if (!modelId) return;
    setBusy(true);
    try {
      const model = await fetchJson<ProviderModel>(
        `/api/workspace/providers/${providerId}/models`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspaceId,
            modelId,
            displayName,
          }),
        },
      );
      setModels((current) => [...current, model]);
      setModelDbId(model.id);
      setManualModelId("");
      toast.success(t("toasts.modelSelected"));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("toasts.modelAddFailed"),
      );
      return;
    } finally {
      setBusy(false);
    }
  }

  async function addDiscoveredModel(modelId: string) {
    if (!workspaceId || !providerId) return;
    const candidate = discoveredModels.find(
      (model) => model.modelId === modelId,
    );
    if (!candidate) return;
    setBusy(true);
    try {
      const model = await fetchJson<ProviderModel>(
        `/api/workspace/providers/${providerId}/models`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspaceId,
            modelId: candidate.modelId,
            displayName: candidate.displayName ?? candidate.modelId,
            capabilitiesJson: candidate.capabilities,
            contextWindow: candidate.contextWindow,
            maxOutputTokens: candidate.maxOutputTokens,
            inputTokenCost: candidate.inputTokenCost,
            outputTokenCost: candidate.outputTokenCost,
            imageGenerationConfigJson: candidate.imageGeneration,
            sustainabilityConfigJson: candidate.sustainability,
          }),
        },
      );
      setModels([model]);
      setModelDbId(model.id);
      toast.success(t("toasts.modelSelected"));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("toasts.modelAddFailed"),
      );
    } finally {
      setBusy(false);
    }
  }

  async function finishSetup() {
    if (!workspaceId) return;
    if (!providerId) return;
    if (!modelDbId) return;
    setBusy(true);
    try {
      let completedAgentId = agentId;

      if (completedAgentId) {
        const currentAgent = await fetchJson<{
          activeVersionId: string | null;
        }>(
          `/api/workspace/agents/${completedAgentId}?workspaceId=${workspaceId}`,
        );
        await fetchJson(`/api/workspace/agents/${completedAgentId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspaceId,
            baseVersionId: currentAgent.activeVersionId,
            providerId,
            modelId: modelDbId,
          }),
        });
      } else {
        const data = await fetchJson<{ agent: { id: string } }>(
          "/api/workspace/agents",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              workspaceId,
              name: agentForm.name,
              slug: slugify(agentForm.name),
              systemPrompt: "",
              providerId,
              modelId: modelDbId,
              toolPreset: ONBOARDING_TOOL_PRESET,
            }),
          },
        );
        completedAgentId = data.agent.id;
        setAgentId(completedAgentId);
      }

      const onboardingResponse = await fetch("/api/onboarding", {
        method: "POST",
      });
      if (!onboardingResponse.ok) {
        toast.warning(t("toasts.onboardingMarkerFailed"));
      }
      toast.success(t("toasts.assistantReady"));
      if (completedAgentId) onCompleteAction?.(completedAgentId);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("toasts.finishFailed"),
      );
      return;
    } finally {
      setBusy(false);
    }
  }

  if (!workspaceId) {
    return <SetupWizardLoading />;
  }

  if (providersLoadError || (step === "model" && modelsLoadError)) {
    return (
      <SetupWizardLoadError
        title={
          providersLoadError ? t("providerLoadFailed") : t("modelLoadFailed")
        }
        description={t("loadFailedDescription")}
        retryLabel={t("retry")}
        onRetry={() => setLoadAttempt((attempt) => attempt + 1)}
      />
    );
  }

  return {
    kind: "ready",
    addAndSelectModel,
    addDiscoveredModel,
    agentForm,
    agentId,
    busy,
    createProvider,
    discoveredModels,
    finishSetup,
    loadingModels,
    loadingProviders,
    manualModelId,
    mode,
    modelDbId,
    models,
    onCancelAction,
    providerForm,
    providerId,
    providers,
    selectedModel: models.find((model) => model.id === modelDbId),
    selectedProvider: providers.find((provider) => provider.id === providerId),
    setAgentForm,
    setManualModelId,
    setModelDbId,
    setProviderForm,
    setProviderId,
    setStep,
    step,
    t,
  } as const;
}


export type SetupWizardViewModel = Extract<
  ReturnType<typeof useSetupWizardController>,
  { kind: "ready" }
>;
export function SetupWizardView({ model }: { model: SetupWizardViewModel }) {
  const { onCancelAction, step } = model;
  return (
    <div className="flex flex-col gap-6">
      <SetupStepper currentStep={step} />

      {/* ── Step: Provider ── */}
      {step === "provider" && <SetupWizardProviderStep model={model} />}

      {/* ── Step: SetupWizardViewModel ── */}
      {step === "model" && <SetupWizardModelStep model={model} />}

      {/* ── Step: Agent ── */}
      {step === "agent" && <SetupWizardAgentStep model={model} />}

      {onCancelAction && <SetupWizardPart1Step model={model} />}
    </div>
  );
}


export function SetupWizardAgentStep({
  model,
}: {
  model: SetupWizardViewModel;
}) {
  const {
    agentForm,
    agentId,
    busy,
    finishSetup,
    mode,
    modelDbId,
    selectedModel,
    selectedProvider,
    setAgentForm,
    setStep,
    t,
  } = model;
  return (
    <Card className="animate-in-up">
      <CardHeader>
        <CardTitle className="flex items-center gap-2.5">
          <MessageSquareIcon
            className="size-5 text-primary"
            aria-hidden="true"
          />
          {t("agentTitle")}
        </CardTitle>
        <CardDescription>{t("agentStepDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          {/* Summary */}
          <div className="rounded-xl border border-border/70 bg-muted/30 p-4">
            <div className="flex flex-col gap-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t("connection")}</span>
                <span className="font-medium">{selectedProvider?.name}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t("model")}</span>
                <span className="font-medium">
                  {selectedModel?.displayName ?? selectedModel?.modelId}
                </span>
              </div>
            </div>
          </div>

          {agentId ? (
            <FieldDescription>{t("currentAssistantHint")}</FieldDescription>
          ) : (
            <Field>
              <FieldLabel htmlFor="agent-name">{t("assistantName")}</FieldLabel>
              <FieldContent>
                <Input
                  id="agent-name"
                  name="setup-agent-name"
                  autoComplete="off"
                  placeholder={t("assistantNamePlaceholder")}
                  value={agentForm.name}
                  onChange={(event) =>
                    setAgentForm({ name: event.target.value })
                  }
                />
              </FieldContent>
            </Field>
          )}

          <div className="flex flex-wrap gap-2 pt-2">
            <Button
              type={BUTTON_TYPE}
              onClick={() => void finishSetup()}
              disabled={
                busy || !modelDbId || (!agentId && !agentForm.name.trim())
              }
            >
              {busy ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <MessageSquareIcon
                  data-icon="inline-start"
                  aria-hidden="true"
                />
              )}
              {t("startChat")}
            </Button>
            <Button
              type={BUTTON_TYPE}
              variant={OUTLINE_VARIANT}
              onClick={() => setStep("model")}
            >
              {t("back")}
            </Button>
            {mode === "page" && (
              <Button variant="ghost" asChild>
                <Link href={agentId ? `/chat?agentId=${agentId}` : "/chat"}>
                  {t("skipForNow")}
                </Link>
              </Button>
            )}
          </div>
        </FieldGroup>
      </CardContent>
    </Card>
  );
}


export function SetupWizardModelStep({
  model,
}: {
  model: SetupWizardViewModel;
}) {
  const {
    addAndSelectModel,
    addDiscoveredModel,
    busy,
    discoveredModels,
    loadingModels,
    manualModelId,
    modelDbId,
    models,
    providerId,
    providers,
    selectedModel,
    setManualModelId,
    setModelDbId,
    setProviderId,
    setStep,
    t,
  } = model;
  return (
    <Card className="animate-in-up">
      <CardHeader>
        <CardTitle className="flex items-center gap-2.5">
          <CheckCircle2Icon
            className="size-5 text-primary"
            aria-hidden="true"
          />
          {t("modelTitle")}
        </CardTitle>
        <CardDescription>{t("modelStepDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          {providers.length > 0 ? (
            <Field>
              <FieldLabel htmlFor="setup-provider">
                {t("connection")}
              </FieldLabel>
              <FieldContent>
                <Select
                  value={providerId ?? undefined}
                  onValueChange={(value) => {
                    setProviderId(value);
                    setModelDbId(null);
                  }}
                >
                  <SelectTrigger id="setup-provider" className="w-full">
                    <SelectValue placeholder={t("selectConnection")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {providers.map((provider) => (
                        <SelectItem key={provider.id} value={provider.id}>
                          {provider.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </FieldContent>
            </Field>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button
              type={BUTTON_TYPE}
              variant="ghost"
              onClick={() => setStep("provider")}
            >
              {t("changeConnection")}
            </Button>
          </div>

          {/* Saved models selector */}
          {models.length > 0 && (
            <Field>
              <FieldLabel htmlFor="setup-model">
                {t("modelForAssistant")}
              </FieldLabel>
              <FieldContent>
                <Select
                  value={modelDbId ?? undefined}
                  onValueChange={setModelDbId}
                  disabled={loadingModels}
                >
                  <SelectTrigger id="setup-model" className="w-full">
                    <SelectValue placeholder={t("selectModel")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {models.map((model) => (
                        <SelectItem key={model.id} value={model.id}>
                          {model.displayName ?? model.modelId}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                {selectedModel && (
                  <ModelMetadata
                    capabilities={selectedModel.capabilitiesJson}
                    contextWindow={selectedModel.contextWindow}
                    maxOutputTokens={selectedModel.maxOutputTokens}
                    inputTokenCost={selectedModel.inputTokenCost}
                    outputTokenCost={selectedModel.outputTokenCost}
                    enabled={selectedModel.enabled}
                  />
                )}
              </FieldContent>
            </Field>
          )}

          {models.length === 0 && discoveredModels.length > 0 && (
            <Field>
              <FieldLabel htmlFor="setup-discovered-model">
                {t("modelForAssistant")}
              </FieldLabel>
              <FieldContent>
                <Select
                  onValueChange={(value) => void addDiscoveredModel(value)}
                  disabled={loadingModels || busy}
                >
                  <SelectTrigger id="setup-discovered-model" className="w-full">
                    <SelectValue placeholder={t("selectModel")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {discoveredModels.map((model) => (
                        <SelectItem key={model.modelId} value={model.modelId}>
                          {model.displayName ?? model.modelId}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </FieldContent>
            </Field>
          )}

          {models.length === 0 && discoveredModels.length === 0 && (
            <Field>
              <FieldLabel htmlFor="manual-model">
                {t("manualModelLabel")}
              </FieldLabel>
              <FieldContent>
                <div className="flex gap-2">
                  <Input
                    id="manual-model"
                    name="setup-manual-model"
                    autoComplete="off"
                    placeholder="gpt-4o-mini…"
                    value={manualModelId}
                    onChange={(event) => setManualModelId(event.target.value)}
                  />
                  <Button
                    type={BUTTON_TYPE}
                    variant={OUTLINE_VARIANT}
                    disabled={busy || !providerId || !manualModelId.trim()}
                    onClick={() => void addAndSelectModel()}
                  >
                    {t("addModel")}
                  </Button>
                </div>
                <FieldDescription>{t("noRegisteredModels")}</FieldDescription>
              </FieldContent>
            </Field>
          )}

          <Button
            type={BUTTON_TYPE}
            className="mt-2"
            onClick={() => setStep("agent")}
            disabled={!modelDbId}
          >
            {t("continue")}
          </Button>
        </FieldGroup>
      </CardContent>
    </Card>
  );
}


export function SetupWizardPart1Step({
  model,
}: {
  model: SetupWizardViewModel;
}) {
  const { onCancelAction, t } = model;
  return (
    <Button type={BUTTON_TYPE} variant="ghost" onClick={onCancelAction}>
      {t("cancel")}
    </Button>
  );
}


export function SetupWizardProviderStep({
  model,
}: {
  model: SetupWizardViewModel;
}) {
  const {
    busy,
    createProvider,
    loadingProviders,
    providerForm,
    providers,
    setProviderForm,
    setStep,
    t,
  } = model;
  return (
    <Card className="animate-in-up">
      <CardHeader>
        <CardTitle className="flex items-center gap-2.5">
          <PlugZapIcon className="size-5 text-primary" aria-hidden="true" />
          {t("providerTitle")}
        </CardTitle>
        <CardDescription>{t("providerStepDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="provider-name">
              {t("connectionName")}
            </FieldLabel>
            <FieldContent>
              <Input
                id="provider-name"
                name="setup-provider-name"
                autoComplete="organization"
                placeholder={t("connectionNamePlaceholder")}
                value={providerForm.name}
                onChange={(event) =>
                  setProviderForm({
                    ...providerForm,
                    name: event.target.value,
                  })
                }
              />
            </FieldContent>
          </Field>

          <Field>
            <FieldLabel htmlFor="provider-kind">{t("providerType")}</FieldLabel>
            <FieldContent>
              <Select
                value={providerForm.kind}
                onValueChange={(value) =>
                  setProviderForm({
                    ...providerForm,
                    kind: value as ProviderKind,
                  })
                }
              >
                <SelectTrigger id="provider-kind" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="openai-compatible">
                      OpenAI-compatible
                    </SelectItem>
                    <SelectItem value="vercel-ai-gateway">
                      Vercel AI Gateway
                    </SelectItem>
                    <SelectItem value="dragonfly">Dragonfly</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </FieldContent>
          </Field>

          {providerForm.kind === "openai-compatible" ? (
            <Field>
              <FieldLabel htmlFor="openai-compatible-api-route">
                {t("apiRoute")}
              </FieldLabel>
              <FieldContent>
                <Select
                  value={providerForm.openaiCompatibleApiRoute}
                  onValueChange={(value) =>
                    setProviderForm({
                      ...providerForm,
                      openaiCompatibleApiRoute:
                        value as OpenAICompatibleApiRoute,
                    })
                  }
                >
                  <SelectTrigger
                    id="openai-compatible-api-route"
                    className="w-full"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="responses">
                        {t("apiRouteResponses")}
                      </SelectItem>
                      <SelectItem value="chat-completions">
                        {t("apiRouteChatCompletions")}
                      </SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <FieldDescription>{t("apiRouteHint")}</FieldDescription>
              </FieldContent>
            </Field>
          ) : null}

          <Field>
            <FieldLabel htmlFor="base-url">{t("serviceUrl")}</FieldLabel>
            <FieldContent>
              <Input
                id="base-url"
                name="setup-provider-base-url"
                inputMode="url"
                autoComplete="url"
                placeholder="https://api.openai.com/v1"
                value={providerForm.baseUrl}
                onChange={(event) =>
                  setProviderForm({
                    ...providerForm,
                    baseUrl: event.target.value,
                  })
                }
              />
              <FieldDescription>{t("serviceUrlHint")}</FieldDescription>
            </FieldContent>
          </Field>

          <Field>
            <FieldLabel htmlFor="api-key">{t("apiKey")}</FieldLabel>
            <FieldContent>
              <Input
                id="api-key"
                name="setup-provider-api-key"
                type="password"
                autoComplete="new-password"
                placeholder="sk-…"
                value={providerForm.apiKey}
                onChange={(event) =>
                  setProviderForm({
                    ...providerForm,
                    apiKey: event.target.value,
                  })
                }
              />
            </FieldContent>
          </Field>

          <div className="flex flex-wrap gap-2 pt-2">
            <Button
              type={BUTTON_TYPE}
              onClick={() => void createProvider()}
              disabled={busy || !providerForm.name.trim()}
            >
              {busy ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <PlugZapIcon data-icon="inline-start" aria-hidden="true" />
              )}
              {t("saveContinue")}
            </Button>
            {providers.length > 0 ? (
              <Button
                type={BUTTON_TYPE}
                variant={OUTLINE_VARIANT}
                disabled={loadingProviders}
                onClick={() => setStep("model")}
              >
                {t("useExistingConnection")}
              </Button>
            ) : null}
          </div>
        </FieldGroup>
      </CardContent>
    </Card>
  );
}

