"use client";

import { type RagConfig } from "@/modules/knowledge/rag-config-schema";
import { useTranslations } from "next-intl";
import { RagModelOption } from "./page.knowledge-base";
import { RagConfigFieldsView } from "./page.rag-config-fields.view";

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
