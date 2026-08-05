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
import { ModelsPanelProps } from "./model-list.read-logo-file";
import { RegisteredModelRow } from "./model-list.registered-model-row";


export function RegisteredModelsList({
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
