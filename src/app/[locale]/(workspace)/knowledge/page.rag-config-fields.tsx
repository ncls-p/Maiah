"use client";
import { type RagConfig } from "@/modules/knowledge/rag-config-schema";
import { useTranslations } from "next-intl";
import { RagModelOption } from "./page.knowledge-base";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";

export function useRagConfigFieldsController({
  idPrefix,
  config,
  onChange,
  canManageModels,
  models,
  discoveringModels,
}: {
  idPrefix: string;
  config: RagConfig;
  onChange: (config: RagConfig) => void;
  canManageModels: boolean;
  models: RagModelOption[];
  discoveringModels: boolean;
}) {
  const t = useTranslations("knowledge");
  const embeddingModels = models.some((model) => model.embeddings)
    ? models.filter((model) => model.embeddings)
    : models;
  const rerankingModels = models.some((model) =>
    model.modelId.toLowerCase().includes("rerank"),
  )
    ? models.filter((model) => model.modelId.toLowerCase().includes("rerank"))
    : models;
  // Never hide models: providers often omit modality metadata in /models, so
  // a missing vision flag doesn't mean the model can't see. Declared vision
  // models are just listed first.
  const visionModels = [...models].sort(
    (a, b) => Number(b.vision) - Number(a.vision),
  );
  const modelValue = (model: RagModelOption) =>
    `${model.providerId}:${model.modelId}`;

  function selectModel(
    value: string,
    target: "embedding" | "reranking" | "ocr",
  ) {
    const model = models.find((candidate) => modelValue(candidate) === value);
    if (!model) return;
    onChange(
      target === "embedding"
        ? {
            ...config,
            embedding: {
              ...config.embedding,
              providerId: model.providerId,
              modelId: model.modelId,
            },
          }
        : target === "reranking"
          ? {
              ...config,
              reranking: {
                ...config.reranking,
                providerId: model.providerId,
                modelId: model.modelId,
              },
            }
          : {
              ...config,
              extraction: {
                ...config.extraction,
                ocr: {
                  ...config.extraction.ocr,
                  providerId: model.providerId,
                  modelId: model.modelId,
                },
              },
            },
    );
  }

  return {
    kind: "ready",
    canManageModels,
    config,
    discoveringModels,
    embeddingModels,
    idPrefix,
    modelValue,
    onChange,
    rerankingModels,
    selectModel,
    t,
    visionModels,
  } as const;
}

export function RagConfigFields(
  ...args: Parameters<typeof useRagConfigFieldsController>
) {
  const model = useRagConfigFieldsController(...args);
  if (!("kind" in model)) return model;
  return <RagConfigFieldsView model={model} />;
}


export type RagConfigFieldsViewModel = Extract<
  ReturnType<typeof useRagConfigFieldsController>,
  { kind: "ready" }
>;
export function RagConfigFieldsView({
  model,
}: {
  model: RagConfigFieldsViewModel;
}) {
  const {
    canManageModels,
    config,
    discoveringModels,
    embeddingModels,
    idPrefix,
    modelValue,
    onChange,
    selectModel,
    t,
  } = model;
  return (
    <div className="grid gap-4">
      {canManageModels ? (
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,14rem),1fr))]">
          <div className="grid min-w-0 gap-1.5">
            <Label
              htmlFor={`${idPrefix}-embedding-discovered`}
              help={t("ragEmbeddingModelHelp")}
            >
              {t("ragEmbeddingModel")}
            </Label>
            <Select onValueChange={(value) => selectModel(value, "embedding")}>
              <SelectTrigger
                id={`${idPrefix}-embedding-discovered`}
                className="min-w-0"
              >
                <SelectValue
                  placeholder={
                    discoveringModels
                      ? t("ragDiscoveringModels")
                      : t("ragSelectModel")
                  }
                />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {embeddingModels.map((model) => (
                    <SelectItem
                      key={`embedding-${modelValue(model)}`}
                      value={modelValue(model)}
                    >
                      {model.providerName} ·{" "}
                      {model.displayName || model.modelId}
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
            <Label
              htmlFor={`${idPrefix}-dimensions`}
              help={t("ragDimensionsHelp")}
            >
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
                    dimensions: event.target.value
                      ? Number(event.target.value)
                      : null,
                  },
                })
              }
              placeholder={t("ragNativeDimensions")}
            />
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-border/70 bg-muted/20 p-3 text-xs leading-5 text-muted-foreground">
          {t("ragModelsPermissionHint")}
        </div>
      )}

      <RagConfigFieldsSection3 model={model} />

      <RagConfigFieldsSection2 model={model} />

      <RagConfigFieldsSection1 model={model} />
    </div>
  );
}


export function RagConfigFieldsSection1({
  model,
}: {
  model: RagConfigFieldsViewModel;
}) {
  const {
    canManageModels,
    config,
    discoveringModels,
    idPrefix,
    modelValue,
    onChange,
    selectModel,
    t,
    visionModels,
  } = model;
  return (
    <div className="grid gap-3 rounded-lg border p-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Label htmlFor={`${idPrefix}-ocr-enabled`} help={t("ragOcrHint")}>
            {t("ragOcrEnabled")}
          </Label>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("ragOcrHint")}
          </p>
        </div>
        <Checkbox
          id={`${idPrefix}-ocr-enabled`}
          checked={config.extraction.ocr.enabled}
          onCheckedChange={(checked) =>
            onChange({
              ...config,
              extraction: {
                ...config.extraction,
                ocr: {
                  ...config.extraction.ocr,
                  enabled: checked === true,
                },
              },
            })
          }
        />
      </div>
      {config.extraction.ocr.enabled ? (
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,12rem),1fr))]">
          {canManageModels ? (
            <div className="col-span-full grid min-w-0 gap-1.5">
              <Label
                htmlFor={`${idPrefix}-ocr-model`}
                help={t("ragOcrModelHelp")}
              >
                {t("ragOcrModel")}
              </Label>
              <Select onValueChange={(value) => selectModel(value, "ocr")}>
                <SelectTrigger id={`${idPrefix}-ocr-model`} className="min-w-0">
                  <SelectValue
                    placeholder={
                      discoveringModels
                        ? t("ragDiscoveringModels")
                        : t("ragSelectVisionModel")
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {visionModels.map((model) => (
                      <SelectItem
                        key={`ocr-${modelValue(model)}`}
                        value={modelValue(model)}
                      >
                        {model.providerName} ·{" "}
                        {model.displayName || model.modelId}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <Input
                aria-label={t("ragExactOcrModelId")}
                value={config.extraction.ocr.modelId}
                onChange={(event) =>
                  onChange({
                    ...config,
                    extraction: {
                      ...config.extraction,
                      ocr: {
                        ...config.extraction.ocr,
                        providerId: null,
                        modelId: event.target.value,
                      },
                    },
                  })
                }
                placeholder={t("ragExactOcrModelId")}
              />
            </div>
          ) : (
            <p className="col-span-full text-xs text-muted-foreground">
              {config.extraction.ocr.modelId || t("ragInheritedModel")}
            </p>
          )}
          <div className="grid min-w-0 gap-1.5">
            <Label
              htmlFor={`${idPrefix}-ocr-min-text`}
              help={t("ragOcrMinimumTextHelp")}
            >
              {t("ragOcrMinimumText")}
            </Label>
            <Input
              id={`${idPrefix}-ocr-min-text`}
              type="number"
              min={0}
              max={10000}
              value={config.extraction.ocr.minimumTextCharactersPerPage}
              onChange={(event) =>
                onChange({
                  ...config,
                  extraction: {
                    ...config.extraction,
                    ocr: {
                      ...config.extraction.ocr,
                      minimumTextCharactersPerPage: Number(event.target.value),
                    },
                  },
                })
              }
            />
          </div>
          <div className="grid min-w-0 gap-1.5">
            <Label
              htmlFor={`${idPrefix}-ocr-max-pages`}
              help={t("ragOcrMaxPagesHelp")}
            >
              {t("ragOcrMaxPages")}
            </Label>
            <Input
              id={`${idPrefix}-ocr-max-pages`}
              type="number"
              min={1}
              max={500}
              value={config.extraction.ocr.maxVisualPages}
              onChange={(event) =>
                onChange({
                  ...config,
                  extraction: {
                    ...config.extraction,
                    ocr: {
                      ...config.extraction.ocr,
                      maxVisualPages: Number(event.target.value),
                    },
                  },
                })
              }
            />
          </div>
          <div className="col-span-full flex min-w-0 items-center justify-between gap-3 rounded-lg border p-3">
            <Label
              htmlFor={`${idPrefix}-ocr-diagrams`}
              help={t("ragOcrDescribeDiagramsHelp")}
            >
              {t("ragOcrDescribeDiagrams")}
            </Label>
            <Checkbox
              id={`${idPrefix}-ocr-diagrams`}
              checked={config.extraction.ocr.describeDiagrams}
              onCheckedChange={(checked) =>
                onChange({
                  ...config,
                  extraction: {
                    ...config.extraction,
                    ocr: {
                      ...config.extraction.ocr,
                      describeDiagrams: checked === true,
                    },
                  },
                })
              }
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}


export function RagConfigFieldsSection2({
  model,
}: {
  model: RagConfigFieldsViewModel;
}) {
  const {
    canManageModels,
    config,
    discoveringModels,
    idPrefix,
    modelValue,
    onChange,
    rerankingModels,
    selectModel,
    t,
  } = model;
  return (
    <div className="grid gap-3 rounded-lg border p-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,14rem),1fr))]">
      <div className="flex min-w-0 items-center gap-2">
        <Checkbox
          id={`${idPrefix}-reranking`}
          checked={config.reranking.enabled}
          onCheckedChange={(checked) =>
            onChange({
              ...config,
              reranking: {
                ...config.reranking,
                enabled: checked === true,
              },
            })
          }
        />
        <Label htmlFor={`${idPrefix}-reranking`} help={t("ragRerankingHelp")}>
          {t("ragReranking")}
        </Label>
      </div>
      {canManageModels ? (
        <div className="grid min-w-0 gap-1.5">
          <Label
            htmlFor={`${idPrefix}-reranking-model`}
            help={t("ragRerankingModelHelp")}
          >
            {t("ragRerankingModel")}
          </Label>
          <Select
            disabled={!config.reranking.enabled}
            onValueChange={(value) => selectModel(value, "reranking")}
          >
            <SelectTrigger
              id={`${idPrefix}-reranking-model`}
              className="min-w-0"
            >
              <SelectValue
                placeholder={
                  discoveringModels
                    ? t("ragDiscoveringModels")
                    : t("ragSelectModel")
                }
              />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {rerankingModels.map((model) => (
                  <SelectItem
                    key={`reranking-${modelValue(model)}`}
                    value={modelValue(model)}
                  >
                    {model.providerName} · {model.displayName || model.modelId}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <Input
            aria-label={t("ragExactRerankingModelId")}
            disabled={!config.reranking.enabled}
            value={config.reranking.modelId}
            onChange={(event) =>
              onChange({
                ...config,
                reranking: {
                  ...config.reranking,
                  providerId: null,
                  modelId: event.target.value,
                },
              })
            }
            placeholder={t("ragExactRerankingModelId")}
          />
        </div>
      ) : (
        <p className="pb-2 text-xs text-muted-foreground">
          {config.reranking.modelId || t("ragInheritedModel")}
        </p>
      )}
    </div>
  );
}


export function RagConfigFieldsSection3({
  model,
}: {
  model: RagConfigFieldsViewModel;
}) {
  const { config, idPrefix, onChange, t } = model;
  return (
    <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,8rem),1fr))]">
      {(
        [
          ["ragChunkSize", "maxCharacters", config.chunking.maxCharacters],
          [
            "ragChunkOverlap",
            "overlapCharacters",
            config.chunking.overlapCharacters,
          ],
          ["ragCandidates", "candidateCount", config.retrieval.candidateCount],
          ["ragResults", "resultCount", config.retrieval.resultCount],
          ["ragMinimumScore", "minimumScore", config.retrieval.minimumScore],
        ] as const
      ).map(([label, key, value]) => (
        <div className="grid min-w-0 gap-1.5" key={key}>
          <Label htmlFor={`${idPrefix}-${key}`} help={t(`${label}Help`)}>
            {t(label)}
          </Label>
          <Input
            id={`${idPrefix}-${key}`}
            type="number"
            min={
              key === "minimumScore" ? -1 : key === "overlapCharacters" ? 0 : 1
            }
            max={key === "minimumScore" ? 1 : undefined}
            step={key === "minimumScore" ? 0.01 : 1}
            value={value}
            onChange={(event) => {
              const next = Number(event.target.value);
              if (!Number.isFinite(next)) return;
              onChange(
                key === "maxCharacters" || key === "overlapCharacters"
                  ? {
                      ...config,
                      chunking: { ...config.chunking, [key]: next },
                    }
                  : {
                      ...config,
                      retrieval: { ...config.retrieval, [key]: next },
                    },
              );
            }}
          />
        </div>
      ))}
    </div>
  );
}

