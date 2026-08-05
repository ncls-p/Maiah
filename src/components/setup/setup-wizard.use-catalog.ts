import type { DiscoveredModel } from "@/components/providers/provider-manager/types";
import { fetchJson } from "@/lib/api-client";
import { useEffect, type Dispatch, type SetStateAction } from "react";
import type {
  ProviderModel,
  ProviderSummary,
} from "./setup-wizard.button-type";

type CatalogOptions = {
  workspaceId: string | null;
  providerId: string | null;
  loadAttempt: number;
  setLoadingProviders: Dispatch<SetStateAction<boolean>>;
  setProvidersLoadError: Dispatch<SetStateAction<boolean>>;
  setProviders: Dispatch<SetStateAction<ProviderSummary[]>>;
  setProviderId: Dispatch<SetStateAction<string | null>>;
  setStep: Dispatch<SetStateAction<"provider" | "model" | "agent">>;
  setLoadingModels: Dispatch<SetStateAction<boolean>>;
  setModelsLoadError: Dispatch<SetStateAction<boolean>>;
  setModels: Dispatch<SetStateAction<ProviderModel[]>>;
  setDiscoveredModels: Dispatch<SetStateAction<DiscoveredModel[]>>;
  setModelDbId: Dispatch<SetStateAction<string | null>>;
};

export function useSetupWizardCatalog(options: CatalogOptions) {
  const {
    workspaceId,
    providerId,
    loadAttempt,
    setLoadingProviders,
    setProvidersLoadError,
    setProviders,
    setProviderId,
    setStep,
    setLoadingModels,
    setModelsLoadError,
    setModels,
    setDiscoveredModels,
    setModelDbId,
  } = options;
  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;

    async function loadProviders() {
      setLoadingProviders(true);
      setProvidersLoadError(false);
      try {
        const rows = await fetchJson<ProviderSummary[]>(
          `/api/workspace/providers?workspaceId=${workspaceId}`,
        );
        if (cancelled) return;
        setProviders(rows);
        if (rows[0]) {
          setProviderId(rows[0].id);
          setStep("model");
        }
      } catch {
        if (!cancelled) setProvidersLoadError(true);
      } finally {
        if (!cancelled) setLoadingProviders(false);
      }
    }

    void loadProviders();
    return () => {
      cancelled = true;
    };
  }, [
    workspaceId,
    loadAttempt,
    setLoadingProviders,
    setProviderId,
    setProviders,
    setProvidersLoadError,
    setStep,
  ]);

  useEffect(() => {
    if (!workspaceId || !providerId) return;
    let cancelled = false;

    async function loadModels() {
      setLoadingModels(true);
      setModelsLoadError(false);
      setModels([]);
      setDiscoveredModels([]);
      try {
        const rows = await fetchJson<ProviderModel[]>(
          `/api/workspace/providers/${providerId}/models?workspaceId=${workspaceId}`,
        );
        if (cancelled) return;
        setModels(rows);
        setModelDbId((current) =>
          current && rows.some((model) => model.id === current)
            ? current
            : (rows[0]?.id ?? null),
        );
        if (rows.length === 0) {
          try {
            const catalog = await fetchJson<DiscoveredModel[]>(
              `/api/workspace/providers/${providerId}/models?workspaceId=${workspaceId}&action=discover`,
            );
            if (!cancelled) setDiscoveredModels(catalog);
          } catch {
            if (!cancelled) setDiscoveredModels([]);
          }
        }
      } catch {
        if (!cancelled) {
          setModelsLoadError(true);
        }
      } finally {
        if (!cancelled) setLoadingModels(false);
      }
    }

    void loadModels();
    return () => {
      cancelled = true;
    };
  }, [
    workspaceId,
    providerId,
    loadAttempt,
    setDiscoveredModels,
    setLoadingModels,
    setModelDbId,
    setModels,
    setModelsLoadError,
  ]);
}
