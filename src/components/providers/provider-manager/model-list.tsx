import {
  ImagePlusIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { AdvancedSection } from "@/components/ui/advanced-section";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import { ModelLogo } from "@/components/providers/model-logo";
import { ModelConfigDialog } from "./model-config-dialog";
import { ModelCapabilities } from "./provider-shared";
import type {
  DiscoveredModel,
  ProviderModel,
  ProviderModelUpdate,
  SafeProvider,
} from "./types";

const MAX_LOGO_BYTES = 256 * 1024;

function readLogoFile(file: File) {
  return new Promise<string>((resolve, reject) => {
    if (!file.type.startsWith("image/") || file.type === "image/svg+xml") {
      reject(
        new Error("Use a bitmap image such as PNG, JPG, WebP, GIF, or AVIF."),
      );
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      reject(new Error("Logo must stay under 256 KB."));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Unable to read logo file."));
    reader.readAsDataURL(file);
  });
}

type ModelsPanelProps = {
  selectedProvider: SafeProvider | null;
  providers: SafeProvider[];
  models: ProviderModel[];
  filteredModels: ProviderModel[];
  discoveredModels: DiscoveredModel[];
  modelSearch: string;
  manualModelId: string;
  manualModelName: string;
  loadingModels: boolean;
  loadingProviders: boolean;
  busy: boolean;
  onDiscoverModels: () => void;
  onUpdateModelLogo: (modelId: string, logoUrl: string | null) => void;
  onUpdateModel: (modelId: string, update: ProviderModelUpdate) => void;
  onCreateModel: (model?: DiscoveredModel) => void;
  onCreateSelectedModels: (models: DiscoveredModel[]) => Promise<boolean>;
  onDeleteModel: (modelId: string) => void;
  onModelSearchChange: (value: string) => void;
  onManualModelIdChange: (value: string) => void;
  onManualModelNameChange: (value: string) => void;
};

export function ModelsPanel(props: ModelsPanelProps) {
  const t = useTranslations("providers.manager");
  if (props.selectedProvider) {
    return (
      <section className="rounded-xl border bg-card">
        <ModelsHeader {...props} />
        <AdvancedSection
          label={t("manualModel")}
          hint={t("manualModelHint")}
          storageKey="advanced:provider-manual-model"
          className="m-4 mb-0 border-border/60 bg-muted/20"
        >
          <ManualModelForm {...props} />
        </AdvancedSection>
        <DiscoveredModelsList key={props.selectedProvider.id} {...props} />
        <RegisteredModelsList {...props} />
      </section>
    );
  }

  if (props.providers.length > 0 && !props.loadingProviders) {
    return (
      <div className="rounded-xl border border-dashed bg-card p-8 text-center">
        <p className="text-sm text-muted-foreground">{t("selectProvider")}</p>
      </div>
    );
  }

  return null;
}

function ModelsHeader({
  selectedProvider,
  busy,
  onDiscoverModels,
}: ModelsPanelProps) {
  const t = useTranslations("providers.manager");
  return (
    <div className="flex flex-col gap-3 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h3 className="text-base font-semibold">{t("models")}</h3>
        <p className="text-sm text-muted-foreground">
          {t("modelsForProvider", {
            provider: selectedProvider?.name ?? "—",
          })}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("modelsLoadedAutomatically")}
        </p>
      </div>
      <Button
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={onDiscoverModels}
      >
        <RefreshCwIcon aria-hidden="true" />
        {t("discoverModels")}
      </Button>
    </div>
  );
}

function ManualModelForm({
  manualModelId,
  manualModelName,
  busy,
  onCreateModel,
  onManualModelIdChange,
  onManualModelNameChange,
}: ModelsPanelProps) {
  const t = useTranslations("providers.manager");
  return (
    <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
      <div className="grid gap-1.5">
        <Label htmlFor="model-id" className="text-xs">
          {t("modelId")}
        </Label>
        <Input
          id="model-id"
          name="model-id"
          autoComplete="off"
          value={manualModelId}
          onChange={(e) => onManualModelIdChange(e.target.value)}
          placeholder="gpt-4o-mini…"
          className="font-mono text-sm"
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="model-display-name" className="text-xs">
          {t("displayName")}
        </Label>
        <Input
          id="model-display-name"
          name="model-display-name"
          autoComplete="off"
          value={manualModelName}
          onChange={(e) => onManualModelNameChange(e.target.value)}
          placeholder="GPT-4o mini…"
          className="text-sm"
        />
      </div>
      <div className="flex items-end">
        <Button
          size="sm"
          disabled={busy || !manualModelId}
          onClick={() => onCreateModel()}
        >
          <PlusIcon className="size-4" aria-hidden="true" />
          {t("addModel")}
        </Button>
      </div>
    </div>
  );
}

function DiscoveredModelsList({
  discoveredModels,
  models,
  busy,
  onCreateModel,
  onCreateSelectedModels,
}: ModelsPanelProps) {
  const t = useTranslations("providers.manager");
  const [search, setSearch] = useState("");
  const [selectedModelIds, setSelectedModelIds] = useState<Set<string>>(
    () => new Set(),
  );
  if (discoveredModels.length === 0) return null;

  const registeredIds = new Set(models.map((model) => model.modelId));
  const availableModels = discoveredModels.filter(
    (model) => !registeredIds.has(model.modelId),
  );
  const query = search.trim().toLowerCase();
  const filtered = discoveredModels.filter(
    (model) =>
      !query ||
      model.modelId.toLowerCase().includes(query) ||
      (model.displayName ?? "").toLowerCase().includes(query),
  );
  const visibleAvailableModels = filtered.filter(
    (model) => !registeredIds.has(model.modelId),
  );
  const selectedModels = availableModels.filter((model) =>
    selectedModelIds.has(model.modelId),
  );
  const allVisibleSelected =
    visibleAvailableModels.length > 0 &&
    visibleAvailableModels.every((model) =>
      selectedModelIds.has(model.modelId),
    );
  const someVisibleSelected = visibleAvailableModels.some((model) =>
    selectedModelIds.has(model.modelId),
  );

  function setModelSelected(modelId: string, selected: boolean) {
    setSelectedModelIds((current) => {
      const next = new Set(current);
      if (selected) next.add(modelId);
      else next.delete(modelId);
      return next;
    });
  }

  function setVisibleModelsSelected(selected: boolean) {
    setSelectedModelIds((current) => {
      const next = new Set(current);
      for (const model of visibleAvailableModels) {
        if (selected) next.add(model.modelId);
        else next.delete(model.modelId);
      }
      return next;
    });
  }

  async function addSelectedModels() {
    if (await onCreateSelectedModels(selectedModels)) {
      setSelectedModelIds(new Set());
    }
  }

  return (
    <div className="border-b bg-muted/15 p-4">
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium">
            {t("discoveredModels", { count: discoveredModels.length })}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("discoveredModelsHint")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Checkbox
              id="select-visible-models"
              aria-label={t("selectVisibleModels")}
              disabled={busy || visibleAvailableModels.length === 0}
              checked={
                allVisibleSelected
                  ? true
                  : someVisibleSelected
                    ? "indeterminate"
                    : false
              }
              onCheckedChange={(checked) =>
                setVisibleModelsSelected(checked === true)
              }
            />
            <Label htmlFor="select-visible-models" className="text-xs">
              {t("selectVisibleModels")}
            </Label>
          </div>
          <Button
            size="sm"
            disabled={busy || selectedModels.length === 0}
            onClick={() => void addSelectedModels()}
          >
            <PlusIcon data-icon="inline-start" aria-hidden="true" />
            {t("addSelectedModels", { count: selectedModels.length })}
          </Button>
        </div>
      </div>
      <div className="relative mb-3">
        <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          aria-label={t("filterDiscoveredModels")}
          name="discovered-model-search"
          autoComplete="off"
          placeholder={t("filterDiscoveredModels")}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="h-8 pl-9 text-sm"
        />
      </div>
      <div className="max-h-80 overflow-y-auto rounded-lg border bg-background">
        {filtered.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">
            {t("noModelMatch", { query: search })}
          </p>
        ) : (
          filtered.map((model) => {
            const alreadyRegistered = registeredIds.has(model.modelId);
            return (
              <div
                key={model.modelId}
                className={cn(
                  "flex items-start justify-between gap-3 border-b px-3 py-2.5 last:border-b-0",
                  alreadyRegistered ? "opacity-60" : "hover:bg-muted/30",
                )}
              >
                <div className="flex min-w-0 items-start gap-3">
                  <Checkbox
                    aria-label={t("selectModel", {
                      model: model.displayName || model.modelId,
                    })}
                    disabled={busy || alreadyRegistered}
                    checked={
                      alreadyRegistered || selectedModelIds.has(model.modelId)
                    }
                    onCheckedChange={(checked) =>
                      setModelSelected(model.modelId, checked === true)
                    }
                  />
                  <DiscoveredModelInfo model={model} />
                </div>
                <Button
                  size="xs"
                  variant="outline"
                  disabled={busy || alreadyRegistered}
                  onClick={() => onCreateModel(model)}
                >
                  {alreadyRegistered ? t("alreadyAdded") : t("addModel")}
                </Button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function DiscoveredModelInfo({ model }: { model: DiscoveredModel }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-sm font-medium">
        {model.displayName || model.modelId}
      </p>
      <p className="truncate font-mono text-xs text-muted-foreground">
        {model.modelId}
      </p>
      {model.description ? (
        <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
          {model.description}
        </p>
      ) : null}
      <ModelCapabilities
        capabilities={model.capabilities}
        contextWindow={model.contextWindow}
        maxOutputTokens={model.maxOutputTokens}
        inputTokenCost={model.inputTokenCost}
        outputTokenCost={model.outputTokenCost}
        hostedBy={model.hostedBy}
      />
    </div>
  );
}

function RegisteredModelsList({
  models,
  filteredModels,
  modelSearch,
  loadingModels,
  busy,
  onModelSearchChange,
  onUpdateModelLogo,
  onUpdateModel,
  onDeleteModel,
}: ModelsPanelProps) {
  const t = useTranslations("providers.manager");
  return (
    <div className="p-4">
      <div className="mb-3">
        <p className="text-sm font-medium">{t("registeredModels")}</p>
        <p className="text-xs text-muted-foreground">
          {t("registeredModelsHint")}
        </p>
      </div>
      {models.length > 0 ? (
        <div className="relative mb-3">
          <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label={t("filterModels")}
            name="model-search"
            autoComplete="off"
            placeholder={t("filterModels")}
            value={modelSearch}
            onChange={(e) => onModelSearchChange(e.target.value)}
            className="h-8 pl-9 text-sm"
          />
        </div>
      ) : null}
      <RegisteredModelsBody
        models={models}
        filteredModels={filteredModels}
        modelSearch={modelSearch}
        loadingModels={loadingModels}
        busy={busy}
        onUpdateModelLogo={onUpdateModelLogo}
        onUpdateModel={onUpdateModel}
        onDeleteModel={onDeleteModel}
      />
    </div>
  );
}

function RegisteredModelsBody({
  models,
  filteredModels,
  modelSearch,
  loadingModels,
  busy,
  onUpdateModelLogo,
  onUpdateModel,
  onDeleteModel,
}: Pick<
  ModelsPanelProps,
  | "models"
  | "filteredModels"
  | "modelSearch"
  | "loadingModels"
  | "busy"
  | "onUpdateModelLogo"
  | "onUpdateModel"
  | "onDeleteModel"
>) {
  const t = useTranslations("providers.manager");
  if (loadingModels) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
      </div>
    );
  }

  if (filteredModels.length === 0 && models.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        {t("noModels")}
      </div>
    );
  }

  if (filteredModels.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        {t("noModelMatch", { query: modelSearch })}
      </div>
    );
  }

  return (
    <div className="divide-y rounded-lg border">
      {filteredModels.map((model) => (
        <RegisteredModelRow
          key={model.id}
          model={model}
          busy={busy}
          onUpdateModelLogo={onUpdateModelLogo}
          onUpdateModel={onUpdateModel}
          onDeleteModel={onDeleteModel}
        />
      ))}
    </div>
  );
}

function RegisteredModelRow({
  model,
  busy,
  onUpdateModelLogo,
  onUpdateModel,
  onDeleteModel,
}: {
  model: ProviderModel;
  busy: boolean;
  onUpdateModelLogo: (modelId: string, logoUrl: string | null) => void;
  onUpdateModel: (modelId: string, update: ProviderModelUpdate) => void;
  onDeleteModel: (modelId: string) => void;
}) {
  const t = useTranslations("providers.manager");
  const modelLabel = model.displayName || model.modelId;
  const [editing, setEditing] = useState(false);

  async function handleLogoChange(file: File | undefined) {
    if (!file) return;
    try {
      onUpdateModelLogo(model.id, await readLogoFile(file));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Invalid image file",
      );
    }
  }

  return (
    <div className="group flex items-start justify-between gap-3 px-3 py-2.5 transition-colors hover:bg-muted/30">
      <div className="flex min-w-0 items-start gap-3">
        <ModelLogo logoUrl={model.logoUrl} label={modelLabel} size="lg" />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{modelLabel}</p>
          <p className="truncate font-mono text-xs text-muted-foreground">
            {model.modelId}
          </p>
          <ModelCapabilities
            capabilities={model.capabilitiesJson}
            contextWindow={model.contextWindow}
            maxOutputTokens={model.maxOutputTokens}
            inputTokenCost={model.inputTokenCost}
            outputTokenCost={model.outputTokenCost}
            enabled={model.enabled}
          />
          <div className="mt-1 flex flex-wrap gap-1 text-[10px] text-muted-foreground">
            {model.imageGenerationConfigJson?.enabled ||
            model.capabilitiesJson?.imageGeneration ? (
              <span className="rounded bg-muted px-1.5 py-0.5">
                {t("imageGeneration")}
                {model.imageGenerationConfigJson?.isDefault
                  ? ` · ${t("defaultImageModel")}`
                  : ""}
              </span>
            ) : null}
            {model.sustainabilityConfigJson?.energyKwhPerMillionTokens !==
            undefined ? (
              <span className="rounded bg-muted px-1.5 py-0.5">
                {model.sustainabilityConfigJson.energyKwhPerMillionTokens} kWh/M
                tokens
              </span>
            ) : null}
            {model.sustainabilityConfigJson?.co2GramsPerMillionTokens !==
            undefined ? (
              <span className="rounded bg-muted px-1.5 py-0.5">
                {model.sustainabilityConfigJson.co2GramsPerMillionTokens}{" "}
                gCO₂e/M tokens
              </span>
            ) : null}
          </div>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label={t("editModel")}
          disabled={busy}
          onClick={() => setEditing(true)}
        >
          <PencilIcon className="size-3.5" aria-hidden="true" />
        </Button>
        <input
          id={`model-logo-${model.id}`}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/avif,image/bmp,image/x-icon,image/*"
          className="sr-only"
          disabled={busy}
          onChange={(event) => {
            void handleLogoChange(event.currentTarget.files?.[0]);
            event.currentTarget.value = "";
          }}
        />
        <Button size="icon-xs" variant="ghost" asChild>
          <label
            htmlFor={`model-logo-${model.id}`}
            aria-label={t("assignModelLogo")}
            aria-disabled={busy}
            className={cn(
              "cursor-pointer",
              busy && "pointer-events-none opacity-45",
            )}
          >
            <ImagePlusIcon className="size-3.5" aria-hidden="true" />
          </label>
        </Button>
        {model.logoUrl ? (
          <Button
            size="icon-xs"
            variant="ghost"
            disabled={busy}
            aria-label={t("removeModelLogo")}
            onClick={() => onUpdateModelLogo(model.id, null)}
          >
            <XIcon className="size-3.5" aria-hidden="true" />
          </Button>
        ) : null}
        <Button
          size="xs"
          variant="ghost"
          aria-label={t("removeModel")}
          disabled={busy}
          onClick={() => onDeleteModel(model.id)}
        >
          <Trash2Icon data-icon="inline-start" aria-hidden="true" />
          {t("remove")}
        </Button>
      </div>
      <ModelConfigDialog
        key={`${model.id}:${editing}`}
        model={model}
        open={editing}
        busy={busy}
        onOpenChange={setEditing}
        onSave={(update) => {
          onUpdateModel(model.id, update);
          setEditing(false);
        }}
      />
    </div>
  );
}
