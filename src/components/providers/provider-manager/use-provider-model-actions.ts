import { useTranslations } from "next-intl";
import type { Dispatch,SetStateAction } from "react";
import { toast } from "sonner";

import type { DiscoveredModel,ProviderModelUpdate } from "./types";

export function useProviderModelActions(input: { workspaceId: string; selectedProviderId: string | null; manualModelId: string; manualModelName: string; setManualModelId: Dispatch<SetStateAction<string>>; setManualModelName: Dispatch<SetStateAction<string>>; setBusy: Dispatch<SetStateAction<boolean>>; setDeleteModelId: Dispatch<SetStateAction<string | null>>; loadModelsForProvider: (providerId: string) => Promise<void> }) {
  const { workspaceId, selectedProviderId, manualModelId, manualModelName, setManualModelId, setManualModelName, setBusy, setDeleteModelId, loadModelsForProvider } = input;
  const t = useTranslations("providers.manager");
  async function registerModel(model?: DiscoveredModel) {
    if (!selectedProviderId) return;
    const id = model?.modelId ?? manualModelId;
    const displayName = model?.displayName ?? (manualModelName || id);
    if (!id) return;

    const res = await fetch(`/api/workspace/providers/${selectedProviderId}/models`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspaceId,
        modelId: id,
        displayName,
        capabilitiesJson: model?.capabilities ?? {
          text: true,
          vision: false,
          tools: false,
          reasoning: false,
          embeddings: false,
          audio: false,
        },
        contextWindow: model?.contextWindow,
        maxOutputTokens: model?.maxOutputTokens,
        inputTokenCost: model?.inputTokenCost,
        outputTokenCost: model?.outputTokenCost,
        imageGenerationConfigJson: model?.imageGeneration,
        sustainabilityConfigJson: model?.sustainability,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || t("errorCreateModel"));
    }
  }

  async function createManualModel(model?: DiscoveredModel) {
    if (!selectedProviderId) return;
    setBusy(true);
    try {
      await registerModel(model);
      setManualModelId("");
      setManualModelName("");
      toast.success(t("toastModelRegistered"));
      await loadModelsForProvider(selectedProviderId);
    } catch (error) {
      toast.error((error as Error).message);
      return;
    } finally {
      setBusy(false);
    }
  }

  async function createDiscoveredModels(toCreate: DiscoveredModel[]) {
    if (!selectedProviderId || toCreate.length === 0) return false;
    setBusy(true);
    try {
      for (const model of toCreate) {
        await registerModel(model);
      }
      toast.success(t("toastModelsRegistered", { count: toCreate.length }));
      await loadModelsForProvider(selectedProviderId);
      return true;
    } catch (error) {
      toast.error((error as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function updateModelLogo(modelId: string, logoUrl: string | null) {
    if (!selectedProviderId) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/workspace/providers/${selectedProviderId}/models/${modelId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, logoUrl }),
      });
      if (!res.ok) throw new Error(t("errorUpdateModelLogo"));
      toast.success(logoUrl ? t("toastLogoAssigned") : t("toastLogoRemoved"));
      await loadModelsForProvider(selectedProviderId);
    } catch (error) {
      toast.error((error as Error).message);
      return;
    } finally {
      setBusy(false);
    }
  }

  async function updateModel(modelId: string, update: ProviderModelUpdate) {
    if (!selectedProviderId) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/workspace/providers/${selectedProviderId}/models/${modelId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, ...update }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || t("errorUpdateModel"));
      toast.success(t("toastModelUpdated"));
      await loadModelsForProvider(selectedProviderId);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteModel(modelId: string) {
    if (!selectedProviderId) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/workspace/providers/${selectedProviderId}/models/${modelId}?workspaceId=${workspaceId}`, { method: "DELETE" });
      if (!res.ok) throw new Error(t("errorDeleteModel"));
      setDeleteModelId(null);
      toast.success(t("toastModelRemoved"));
      await loadModelsForProvider(selectedProviderId);
    } catch (error) {
      toast.error((error as Error).message);
      return;
    } finally {
      setBusy(false);
    }
  }
  return { createManualModel, createDiscoveredModels, updateModelLogo, updateModel, deleteModel };
}
