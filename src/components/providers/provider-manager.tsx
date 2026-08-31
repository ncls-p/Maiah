"use client";
import { useTranslations } from "next-intl";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { DEFAULT_OPENAI_COMPATIBLE_API_ROUTE, type OpenAICompatibleApiRoute } from "@/lib/openai-compatible-api";
import { DEFAULT_OPENAI_COMPATIBILITY_PROFILE, type OpenAICompatibilityProfile } from "@/lib/openai-compatibility-profile";
import { KIND_LABELS } from "./provider-manager/constants";
import { DiscoveredModel, ProviderAuthType, ProviderKind, ProviderModel, SafeProvider } from "./provider-manager/types";
import { useProviderModelActions } from "./provider-manager/use-provider-model-actions";
import { defaultAuthType, parsePairs } from "./provider-manager/utils";
import { PlusIcon } from "lucide-react";
import { AdvancedSection } from "@/components/ui/advanced-section";
import { Button } from "@/components/ui/button";
import { ModelsPanel } from "./provider-manager/model-list";
import { AddProviderDialog, DeleteModelDialog, DeleteProviderDialog, EditProviderDialog } from "./provider-manager/provider-dialogs";
import { ProviderList } from "./provider-manager/provider-list";
import { SystemStrip } from "./provider-manager/provider-stats";

export function useProviderManagerController({
  workspaceId,
  initialProviders,
  initialModels,
}: {
  workspaceId: string;
  initialProviders: SafeProvider[];
  initialModels: ProviderModel[];
}) {
  const t = useTranslations("providers.manager");
  const [providers, setProviders] = useState<SafeProvider[]>(initialProviders);
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(
    initialProviders[0]?.id ?? null,
  );
  const [models, setModels] = useState<ProviderModel[]>(initialModels);
  const [discoveredModels, setDiscoveredModels] = useState<DiscoveredModel[]>(
    [],
  );
  const [loadingProviders, setLoadingProviders] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);
  const [busy, setBusy] = useState(false);
  const [providerSearch, setProviderSearch] = useState("");
  const [modelSearch, setModelSearch] = useState("");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [addKind, setAddKind] = useState<ProviderKind>("openai-compatible");
  const [addAuthType, setAddAuthType] = useState<ProviderAuthType>(
    defaultAuthType("openai-compatible"),
  );
  const [addName, setAddName] = useState("");
  const [addBaseUrl, setAddBaseUrl] = useState("");
  const [addApiKey, setAddApiKey] = useState("");
  const [addCustomHeaders, setAddCustomHeaders] = useState("");
  const [addQueryParams, setAddQueryParams] = useState("");
  const [addApiRoute, setAddApiRoute] = useState<OpenAICompatibleApiRoute>(
    DEFAULT_OPENAI_COMPATIBLE_API_ROUTE,
  );
  const [addCompatibilityProfile, setAddCompatibilityProfile] =
    useState<OpenAICompatibilityProfile>(DEFAULT_OPENAI_COMPATIBILITY_PROFILE);
  const [addAdvanced, setAddAdvanced] = useState(false);
  const [editingProvider, setEditingProvider] = useState<SafeProvider | null>(
    null,
  );
  const [editName, setEditName] = useState("");
  const [editBaseUrl, setEditBaseUrl] = useState("");
  const [editApiKey, setEditApiKey] = useState("");
  const [editApiRoute, setEditApiRoute] = useState<OpenAICompatibleApiRoute>(
    DEFAULT_OPENAI_COMPATIBLE_API_ROUTE,
  );
  const [editCompatibilityProfile, setEditCompatibilityProfile] =
    useState<OpenAICompatibilityProfile>(DEFAULT_OPENAI_COMPATIBILITY_PROFILE);
  const [deleteProviderId, setDeleteProviderId] = useState<string | null>(null);
  const [deleteModelId, setDeleteModelId] = useState<string | null>(null);
  const [manualModelId, setManualModelId] = useState("");
  const [manualModelName, setManualModelName] = useState("");

  const selectedProvider = useMemo(
    () => providers.find((p) => p.id === selectedProviderId) ?? null,
    [providers, selectedProviderId],
  );

  const filteredProviders = useMemo(() => {
    if (!providerSearch.trim()) return providers;
    const q = providerSearch.toLowerCase();
    return providers.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        KIND_LABELS[p.kind].toLowerCase().includes(q) ||
        (p.baseUrl ?? "").toLowerCase().includes(q),
    );
  }, [providers, providerSearch]);

  const filteredModels = useMemo(() => {
    if (!modelSearch.trim()) return models;
    const q = modelSearch.toLowerCase();
    return models.filter(
      (m) =>
        m.modelId.toLowerCase().includes(q) ||
        (m.displayName ?? "").toLowerCase().includes(q),
    );
  }, [models, modelSearch]);
  const loadProviders = useCallback(async () => {
    setLoadingProviders(true);
    try {
      const res = await fetch(
        `/api/workspace/providers?workspaceId=${workspaceId}`,
      );
      if (!res.ok) throw new Error(t("errorLoadProviders"));
      const data = (await res.json()) as SafeProvider[];
      setProviders(data);
      setSelectedProviderId((current) => current ?? data[0]?.id ?? null);
    } catch (error) {
      toast.error((error as Error).message);
      return;
    } finally {
      setLoadingProviders(false);
    }
  }, [workspaceId, t]);

  const loadModelsForProvider = useCallback(
    async (providerId: string | null) => {
      if (!providerId) {
        setModels([]);
        return;
      }
      setLoadingModels(true);
      try {
        const res = await fetch(
          `/api/workspace/providers/${providerId}/models?workspaceId=${workspaceId}`,
        );
        if (!res.ok) throw new Error(t("errorLoadModels"));
        setModels((await res.json()) as ProviderModel[]);
      } catch (error) {
        setModels([]);
        toast.error((error as Error).message);
        return;
      } finally {
        setLoadingModels(false);
      }
    },
    [workspaceId, t],
  );

  function openAddDialog() {
    resetAddForm();
    setShowAddDialog(true);
  }

  function selectProvider(providerId: string) {
    setSelectedProviderId(providerId);
    setDiscoveredModels([]);
    setModelSearch("");
    void loadModelsForProvider(providerId);
  }

  function resetAddForm() {
    setAddName("");
    setAddBaseUrl("");
    setAddApiKey("");
    setAddCustomHeaders("");
    setAddQueryParams("");
    setAddApiRoute(DEFAULT_OPENAI_COMPATIBLE_API_ROUTE);
    setAddCompatibilityProfile(DEFAULT_OPENAI_COMPATIBILITY_PROFILE);
    setAddKind("openai-compatible");
    setAddAuthType(defaultAuthType("openai-compatible"));
    setAddAdvanced(false);
  }

  function openEditDialog(provider: SafeProvider) {
    setEditingProvider(provider);
    setEditName(provider.name);
    setEditBaseUrl(provider.baseUrl ?? "");
    setEditApiKey("");
    setEditApiRoute(provider.openaiCompatibleApiRoute);
    setEditCompatibilityProfile(provider.openaiCompatibilityProfile);
  }

  async function createNewProvider() {
    setBusy(true);
    try {
      const res = await fetch("/api/workspace/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          kind: addKind,
          name: addName,
          baseUrl: addBaseUrl,
          authType: addAuthType,
          apiKey: addApiKey,
          headersJson: parsePairs(addCustomHeaders),
          queryParamsJson: parsePairs(addQueryParams),
          ...(addKind === "openai-compatible"
            ? {
                openaiCompatibleApiRoute: addApiRoute,
                openaiCompatibilityProfile: addCompatibilityProfile,
              }
            : {}),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || t("errorConnectProvider"));
      }
      const provider = (await res.json()) as SafeProvider;
      setProviders((prev) => [provider, ...prev]);
      setSelectedProviderId(provider.id);
      setShowAddDialog(false);
      resetAddForm();
      toast.success(t("toastProviderConnected"));
      await loadModelsForProvider(provider.id);
    } catch (error) {
      toast.error((error as Error).message);
      return;
    } finally {
      setBusy(false);
    }
  }

  async function discoverProviderModels(
    providerId: string | null = selectedProviderId,
  ) {
    if (!providerId) return;
    setBusy(true);
    try {
      setSelectedProviderId(providerId);
      await loadModelsForProvider(providerId);
      const res = await fetch(
        `/api/workspace/providers/${providerId}/models?workspaceId=${workspaceId}&action=discover`,
      );
      const data = (await res.json().catch(() => ({}))) as
        | DiscoveredModel[]
        | { error?: string };
      if (!res.ok || !Array.isArray(data)) {
        const errorMessage = Array.isArray(data) ? undefined : data.error;
        throw new Error(errorMessage || t("errorDiscoverModels"));
      }
      setDiscoveredModels(data);
      toast.success(t("toastDiscoveredModels", { count: data.length }));
    } catch (error) {
      toast.error((error as Error).message);
      return;
    } finally {
      setBusy(false);
    }
  }

  async function toggleProvider(provider: SafeProvider) {
    setBusy(true);
    try {
      const res = await fetch(`/api/workspace/providers/${provider.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, enabled: !provider.enabled }),
      });
      if (!res.ok) throw new Error(t("errorUpdateProvider"));
      await loadProviders();
    } catch (error) {
      toast.error((error as Error).message);
      return;
    } finally {
      setBusy(false);
    }
  }

  async function saveProviderEdit() {
    if (!editingProvider) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/workspace/providers/${editingProvider.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspaceId,
            name: editName.trim(),
            baseUrl: editBaseUrl.trim() || "",
            ...(editApiKey.trim() ? { apiKey: editApiKey.trim() } : {}),
            ...(editingProvider.kind === "openai-compatible"
              ? {
                  openaiCompatibleApiRoute: editApiRoute,
                  openaiCompatibilityProfile: editCompatibilityProfile,
                }
              : {}),
          }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as SafeProvider & {
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || t("errorUpdateProvider"));
      setEditingProvider(null);
      setEditApiKey("");
      await loadProviders();
      toast.success(t("toastConnectionUpdated"));
      await loadModelsForProvider(editingProvider.id);
    } catch (error) {
      toast.error((error as Error).message);
      return;
    } finally {
      setBusy(false);
    }
  }

  async function deleteProvider(id: string) {
    setBusy(true);
    try {
      const res = await fetch(
        `/api/workspace/providers/${id}?workspaceId=${workspaceId}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error(t("errorArchiveProvider"));
      setProviders((prev) => prev.filter((p) => p.id !== id));
      if (selectedProviderId === id) {
        setSelectedProviderId(null);
        setModels([]);
      }
      setDeleteProviderId(null);
      toast.success(t("toastProviderArchived"));
    } catch (error) {
      toast.error((error as Error).message);
      return;
    } finally {
      setBusy(false);
    }
  }

  const {
    createManualModel,
    createDiscoveredModels,
    updateModelLogo,
    updateModel,
    deleteModel,
  } = useProviderModelActions({
    workspaceId,
    selectedProviderId,
    manualModelId,
    manualModelName,
    setManualModelId,
    setManualModelName,
    setBusy,
    setDeleteModelId,
    loadModelsForProvider,
  });

  return {
    kind: "ready",
    addAdvanced,
    addApiKey,
    addApiRoute,
    addAuthType,
    addCompatibilityProfile,
    addBaseUrl,
    addCustomHeaders,
    addKind,
    addName,
    addQueryParams,
    busy,
    createDiscoveredModels,
    createManualModel,
    createNewProvider,
    deleteModel,
    deleteModelId,
    deleteProvider,
    deleteProviderId,
    discoverProviderModels,
    discoveredModels,
    editApiKey,
    editApiRoute,
    editBaseUrl,
    editCompatibilityProfile,
    editName,
    editingProvider,
    filteredModels,
    filteredProviders,
    loadingModels,
    loadingProviders,
    manualModelId,
    manualModelName,
    modelSearch,
    models,
    openAddDialog,
    openEditDialog,
    providerSearch,
    providers,
    resetAddForm,
    saveProviderEdit,
    selectProvider,
    selectedProvider,
    selectedProviderId,
    setAddAdvanced,
    setAddApiKey,
    setAddApiRoute,
    setAddAuthType,
    setAddCompatibilityProfile,
    setAddBaseUrl,
    setAddCustomHeaders,
    setAddKind,
    setAddName,
    setAddQueryParams,
    setDeleteModelId,
    setDeleteProviderId,
    setEditApiKey,
    setEditApiRoute,
    setEditBaseUrl,
    setEditCompatibilityProfile,
    setEditName,
    setEditingProvider,
    setManualModelId,
    setManualModelName,
    setModelSearch,
    setProviderSearch,
    setShowAddDialog,
    showAddDialog,
    t,
    toggleProvider,
    updateModel,
    updateModelLogo,
  } as const;
}

export function ProviderManager(
  ...args: Parameters<typeof useProviderManagerController>
) {
  const model = useProviderManagerController(...args);
  if (!("kind" in model)) return model;
  return <ProviderManagerView model={model} />;
}


type Model = Extract<
  ReturnType<typeof useProviderManagerController>,
  { kind: "ready" }
>;
export function ProviderManagerView({ model }: { model: Model }) {
  const {
    addAdvanced,
    addApiKey,
    addApiRoute,
    addAuthType,
    addBaseUrl,
    addCompatibilityProfile,
    addCustomHeaders,
    addKind,
    addName,
    addQueryParams,
    busy,
    createDiscoveredModels,
    createManualModel,
    createNewProvider,
    deleteModel,
    deleteModelId,
    deleteProvider,
    deleteProviderId,
    discoverProviderModels,
    discoveredModels,
    editApiKey,
    editApiRoute,
    editBaseUrl,
    editCompatibilityProfile,
    editName,
    editingProvider,
    filteredModels,
    filteredProviders,
    loadingModels,
    loadingProviders,
    manualModelId,
    manualModelName,
    modelSearch,
    models,
    openAddDialog,
    openEditDialog,
    providerSearch,
    providers,
    resetAddForm,
    saveProviderEdit,
    selectProvider,
    selectedProvider,
    selectedProviderId,
    setAddAdvanced,
    setAddApiKey,
    setAddApiRoute,
    setAddAuthType,
    setAddBaseUrl,
    setAddCompatibilityProfile,
    setAddCustomHeaders,
    setAddKind,
    setAddName,
    setAddQueryParams,
    setDeleteModelId,
    setDeleteProviderId,
    setEditApiKey,
    setEditApiRoute,
    setEditBaseUrl,
    setEditCompatibilityProfile,
    setEditName,
    setEditingProvider,
    setManualModelId,
    setManualModelName,
    setModelSearch,
    setProviderSearch,
    setShowAddDialog,
    showAddDialog,
    t,
    toggleProvider,
    updateModel,
    updateModelLogo,
  } = model;
  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button size="sm" onClick={openAddDialog}>
          <PlusIcon className="size-4" aria-hidden="true" />
          {t("connectAi")}
        </Button>
      </div>
      <div>
        <AdvancedSection
          label={t("systemHealth")}
          hint={t("systemHealthHint")}
          storageKey="advanced:providers-health"
          className="border-border/50 bg-muted/20"
        >
          <SystemStrip providers={providers} models={models} />
        </AdvancedSection>
      </div>

      <div className="space-y-6">
        <ProviderList
          providers={providers}
          filteredProviders={filteredProviders}
          selectedProviderId={selectedProviderId}
          providerSearch={providerSearch}
          loadingProviders={loadingProviders}
          busy={busy}
          onSearchChange={setProviderSearch}
          onAddProvider={openAddDialog}
          onSelectProvider={selectProvider}
          onToggleProvider={(provider) => void toggleProvider(provider)}
          onRetryProvider={(providerId) =>
            void discoverProviderModels(providerId)
          }
          onEditProvider={openEditDialog}
          onDeleteProvider={setDeleteProviderId}
        />
        <ModelsPanel
          selectedProvider={selectedProvider}
          providers={providers}
          models={models}
          filteredModels={filteredModels}
          discoveredModels={discoveredModels}
          modelSearch={modelSearch}
          manualModelId={manualModelId}
          manualModelName={manualModelName}
          loadingModels={loadingModels}
          loadingProviders={loadingProviders}
          busy={busy}
          onDiscoverModels={() => void discoverProviderModels()}
          onUpdateModelLogo={(modelId: string, logoUrl: string | null) =>
            void updateModelLogo(modelId, logoUrl)
          }
          onUpdateModel={(modelId, update) => void updateModel(modelId, update)}
          onCreateModel={(model) => void createManualModel(model)}
          onCreateSelectedModels={createDiscoveredModels}
          onDeleteModel={setDeleteModelId}
          onModelSearchChange={setModelSearch}
          onManualModelIdChange={setManualModelId}
          onManualModelNameChange={setManualModelName}
        />
      </div>

      <AddProviderDialog
        open={showAddDialog}
        busy={busy}
        addKind={addKind}
        addAuthType={addAuthType}
        addName={addName}
        addBaseUrl={addBaseUrl}
        addApiKey={addApiKey}
        addCustomHeaders={addCustomHeaders}
        addQueryParams={addQueryParams}
        addApiRoute={addApiRoute}
        addCompatibilityProfile={addCompatibilityProfile}
        addAdvanced={addAdvanced}
        onOpenChange={(open) => {
          setShowAddDialog(open);
          if (!open) resetAddForm();
        }}
        onKindChange={setAddKind}
        onAuthTypeChange={setAddAuthType}
        onNameChange={setAddName}
        onBaseUrlChange={setAddBaseUrl}
        onApiKeyChange={setAddApiKey}
        onCustomHeadersChange={setAddCustomHeaders}
        onQueryParamsChange={setAddQueryParams}
        onApiRouteChange={setAddApiRoute}
        onCompatibilityProfileChange={setAddCompatibilityProfile}
        onAdvancedChange={setAddAdvanced}
        onCreateProvider={() => void createNewProvider()}
      />
      <EditProviderDialog
        editingProvider={editingProvider}
        busy={busy}
        editName={editName}
        editBaseUrl={editBaseUrl}
        editApiKey={editApiKey}
        editApiRoute={editApiRoute}
        editCompatibilityProfile={editCompatibilityProfile}
        onClose={() => setEditingProvider(null)}
        onNameChange={setEditName}
        onBaseUrlChange={setEditBaseUrl}
        onApiKeyChange={setEditApiKey}
        onApiRouteChange={setEditApiRoute}
        onCompatibilityProfileChange={setEditCompatibilityProfile}
        onSave={() => void saveProviderEdit()}
      />
      <DeleteProviderDialog
        deleteProviderId={deleteProviderId}
        busy={busy}
        onClose={() => setDeleteProviderId(null)}
        onDelete={(id) => void deleteProvider(id)}
      />
      <DeleteModelDialog
        deleteModelId={deleteModelId}
        deleteModelLabel={
          models.find((model) => model.id === deleteModelId)?.displayName ??
          models.find((model) => model.id === deleteModelId)?.modelId ??
          null
        }
        busy={busy}
        onClose={() => setDeleteModelId(null)}
        onDelete={(id) => void deleteModel(id)}
      />
    </div>
  );
}

