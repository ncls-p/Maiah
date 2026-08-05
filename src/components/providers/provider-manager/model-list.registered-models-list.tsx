import {
SearchIcon
} from "lucide-react";
import { useTranslations } from "next-intl";

import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

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
