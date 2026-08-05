import {
PlusIcon,
RefreshCwIcon
} from "lucide-react";
import { useTranslations } from "next-intl";

import { AdvancedSection } from "@/components/ui/advanced-section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { DiscoveredModelsList } from "./model-list.discovered-models-list";
import { RegisteredModelsList } from "./model-list.registered-models-list";
import type {
DiscoveredModel,
ProviderModel,
ProviderModelUpdate,
SafeProvider,
} from "./types";


const MAX_LOGO_BYTES = 256 * 1024;

export function readLogoFile(file: File) {
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

export type ModelsPanelProps = {
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
