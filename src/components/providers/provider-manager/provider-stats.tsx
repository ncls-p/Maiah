import { useTranslations } from "next-intl";

import { MetricCell } from "@/components/ui/metric-cell";

import type { ProviderModel, SafeProvider } from "./types";

export function SystemStrip({
  providers,
  models,
}: {
  providers: SafeProvider[];
  models: ProviderModel[];
}) {
  const t = useTranslations("providers.manager");
  const healthyCount = providers.filter(
    (provider) => provider.healthStatus === "healthy",
  ).length;
  const enabledCount = providers.filter((provider) => provider.enabled).length;
  const totalModels = providers.reduce(
    (sum, provider) =>
      sum + models.filter((model) => model.providerId === provider.id).length,
    0,
  );

  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
      <MetricCell label={t("connections")} value={providers.length} />
      <MetricCell label={t("models")} value={totalModels} />
      <MetricCell label={t("healthy")} value={healthyCount} accent />
      <MetricCell label={t("enabled")} value={enabledCount} />
    </div>
  );
}
