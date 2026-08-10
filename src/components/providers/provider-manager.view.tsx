import { PlusIcon } from "lucide-react";

import { AdvancedSection } from "@/components/ui/advanced-section";
import { Button } from "@/components/ui/button";

import type { useProviderManagerController } from "./provider-manager";
import { ModelsPanel } from "./provider-manager/model-list";
import {
  AddProviderDialog,
  DeleteModelDialog,
  DeleteProviderDialog,
  EditProviderDialog,
} from "./provider-manager/provider-dialogs";
import { ProviderList } from "./provider-manager/provider-list";
import { SystemStrip } from "./provider-manager/provider-stats";

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
