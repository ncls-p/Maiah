import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select,SelectContent,SelectGroup,SelectItem,SelectTrigger,SelectValue } from "@/components/ui/select";
import type { useRagConfigFieldsController } from "./page.rag-config-fields";
import { RagConfigFieldsSection1 } from "./page.rag-config-fields.view.section-1";
import { RagConfigFieldsSection2 } from "./page.rag-config-fields.view.section-2";
import { RagConfigFieldsSection3 } from "./page.rag-config-fields.view.section-3";

export type RagConfigFieldsViewModel = Extract<ReturnType<typeof useRagConfigFieldsController>, { kind: "ready" }>;
export function RagConfigFieldsView({ model }: { model: RagConfigFieldsViewModel }) {
  const { canManageModels, config, discoveringModels, embeddingModels, idPrefix, modelValue, onChange, selectModel, t } = model;
  return (
    <div className="grid gap-4">
      {canManageModels ? (
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,14rem),1fr))]">
          <div className="grid min-w-0 gap-1.5">
            <Label htmlFor={`${idPrefix}-embedding-discovered`} help={t("ragEmbeddingModelHelp")}>
              {t("ragEmbeddingModel")}
            </Label>
            <Select onValueChange={(value) => selectModel(value, "embedding")}>
              <SelectTrigger id={`${idPrefix}-embedding-discovered`} className="min-w-0">
                <SelectValue placeholder={discoveringModels ? t("ragDiscoveringModels") : t("ragSelectModel")} />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {embeddingModels.map((model) => (
                    <SelectItem key={`embedding-${modelValue(model)}`} value={modelValue(model)}>
                      {model.providerName} · {model.displayName || model.modelId}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <Input
              aria-label={t("ragExactModelId")}
              value={config.embedding.modelId}
              onChange={(event) =>
                onChange({
                  ...config,
                  embedding: {
                    ...config.embedding,
                    providerId: null,
                    modelId: event.target.value,
                  },
                })
              }
              placeholder={t("ragExactModelId")}
            />
          </div>
          <div className="grid min-w-0 gap-1.5">
            <Label htmlFor={`${idPrefix}-dimensions`} help={t("ragDimensionsHelp")}>
              {t("ragDimensions")}
            </Label>
            <Input
              id={`${idPrefix}-dimensions`}
              type="number"
              min={1}
              value={config.embedding.dimensions ?? ""}
              onChange={(event) =>
                onChange({
                  ...config,
                  embedding: {
                    ...config.embedding,
                    dimensions: event.target.value ? Number(event.target.value) : null,
                  },
                })
              }
              placeholder={t("ragNativeDimensions")}
            />
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-border/70 bg-muted/20 p-3 text-xs leading-5 text-muted-foreground">{t("ragModelsPermissionHint")}</div>
      )}

      <RagConfigFieldsSection3 model={model} />

      <RagConfigFieldsSection2 model={model} />

      <RagConfigFieldsSection1 model={model} />
    </div>
  );
}
