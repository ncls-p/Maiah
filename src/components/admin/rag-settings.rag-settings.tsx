"use client";

import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { useWorkspace } from "@/hooks/use-workspace";
import type { RagConfig } from "@/modules/knowledge/rag-config";
import { DiscoveredModel } from "./rag-settings.discovered-model";
import { RagSettingsView } from "./rag-settings.rag-settings.view";

export function useRagSettingsController({
  initialState,
}: {
  initialState: RagConfig;
}) {
  const t = useTranslations("admin.settingsPage.rag");
  const { workspaceId } = useWorkspace();
  const [settings, setSettings] = useState(initialState);
  const [saving, setSaving] = useState(false);
  const [models, setModels] = useState<DiscoveredModel[]>([]);
  const [discovering, setDiscovering] = useState(true);
  const configured = Boolean(settings.embedding.modelId);

  useEffect(() => {
    if (!workspaceId) return;
    const controller = new AbortController();
    fetch(`/api/workspace/rag-models?workspaceId=${workspaceId}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Model discovery failed");
        return response.json() as Promise<{
          providers: Array<{
            provider: { id: string; name: string };
            models: Array<{
              modelId: string;
              displayName?: string;
              capabilities?: { embeddings?: boolean; vision?: boolean };
            }>;
          }>;
        }>;
      })
      .then((catalog) => {
        setModels(
          catalog.providers.flatMap(({ provider, models: providerModels }) =>
            providerModels.map((model) => ({
              providerId: provider.id,
              providerName: provider.name,
              modelId: model.modelId,
              displayName: model.displayName,
              embeddings: model.capabilities?.embeddings === true,
              vision: model.capabilities?.vision === true,
            })),
          ),
        );
      })
      .catch((error) => {
        if (error instanceof Error && error.name === "AbortError") return;
        setModels([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setDiscovering(false);
      });
    return () => controller.abort();
  }, [workspaceId]);

  const embeddingModels = useMemo(() => {
    const explicitlySupported = models.filter((model) => model.embeddings);
    return explicitlySupported.length > 0 ? explicitlySupported : models;
  }, [models]);
  const rerankingModels = useMemo(() => {
    const likelyRerankers = models.filter((model) =>
      model.modelId.toLowerCase().includes("rerank"),
    );
    return likelyRerankers.length > 0 ? likelyRerankers : models;
  }, [models]);
  // Never hide models: many OpenAI-compatible /models payloads omit modality
  // metadata, so a missing vision flag doesn't mean the model can't see.
  // Models that do declare vision are simply listed first.
  const visionModels = useMemo(
    () => [...models].sort((a, b) => Number(b.vision) - Number(a.vision)),
    [models],
  );

  function modelValue(model: DiscoveredModel) {
    return `${model.providerId}:${model.modelId}`;
  }

  function selectModel(
    value: string,
    target: "embedding" | "reranking" | "ocr",
  ) {
    const model = models.find((candidate) => modelValue(candidate) === value);
    if (!model) return;
    setSettings(
      target === "embedding"
        ? {
            ...settings,
            embedding: {
              ...settings.embedding,
              // Platform defaults stay portable between workspaces. Runtime
              // resolution selects a compatible provider for this model ID.
              providerId: null,
              modelId: model.modelId,
            },
          }
        : target === "reranking"
          ? {
              ...settings,
              reranking: {
                ...settings.reranking,
                providerId: null,
                modelId: model.modelId,
              },
            }
          : {
              ...settings,
              extraction: {
                ...settings.extraction,
                ocr: {
                  ...settings.extraction.ocr,
                  providerId: null,
                  modelId: model.modelId,
                },
              },
            },
    );
  }

  function numberValue(value: string, fallback: number) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  async function save() {
    setSaving(true);
    try {
      const response = await fetch("/api/admin/rag", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const data = (await response.json().catch(() => null)) as
        | (RagConfig & { error?: string })
        | null;
      if (!response.ok || !data)
        throw new Error(data?.error || t("saveFailed"));
      setSettings(data);
      toast.success(t("saved"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  return {
    kind: "ready",
    configured,
    discovering,
    embeddingModels,
    modelValue,
    numberValue,
    rerankingModels,
    save,
    saving,
    selectModel,
    setSettings,
    settings,
    t,
    visionModels,
  } as const;
}

export function RagSettings(
  ...args: Parameters<typeof useRagSettingsController>
) {
  const model = useRagSettingsController(...args);
  if (!("kind" in model)) return model;
  return <RagSettingsView model={model} />;
}
