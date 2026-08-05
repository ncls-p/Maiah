import {
PlusIcon,
SearchIcon
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

import { ModelsPanelProps } from "./model-list.read-logo-file";
import { ModelCapabilities } from "./provider-shared";
import type {
DiscoveredModel
} from "./types";


export function DiscoveredModelsList({
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
