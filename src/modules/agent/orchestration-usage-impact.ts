import type { AgentExecutionUsage } from "@/modules/agent/runtime-executor";
import {
  calculateTokenUsageImpact,
  parseSustainabilityConfig,
  type UsageImpact,
} from "@/modules/provider/model-runtime-config";
import { db } from "@/server/infrastructure/db";
import { aiModels } from "@/server/infrastructure/db/schema";
import { inArray } from "drizzle-orm";

export async function calculateOrchestrationUsageImpact(
  usages: AgentExecutionUsage[],
  co2GramsPerKwh?: number,
): Promise<UsageImpact> {
  const modelIds = [
    ...new Set(
      usages.flatMap((usage) => (usage.modelId ? [usage.modelId] : [])),
    ),
  ];
  const models =
    modelIds.length > 0
      ? await db
          .select({
            id: aiModels.id,
            inputTokenCost: aiModels.inputTokenCost,
            outputTokenCost: aiModels.outputTokenCost,
            sustainabilityConfigJson: aiModels.sustainabilityConfigJson,
          })
          .from(aiModels)
          .where(inArray(aiModels.id, modelIds))
      : [];
  const modelById = new Map(models.map((model) => [model.id, model]));
  const impacts = usages.map((usage) => {
    const model = usage.modelId ? modelById.get(usage.modelId) : undefined;
    const sustainability = parseSustainabilityConfig(
      model?.sustainabilityConfigJson,
    );
    return calculateTokenUsageImpact({
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      inputCostPerMillion: model?.inputTokenCost,
      outputCostPerMillion: model?.outputTokenCost,
      sustainability,
      currency: sustainability.currency,
      co2GramsPerKwh,
    });
  });
  const currencies = new Set(impacts.map((impact) => impact.currency));
  const sumOrNull = (values: Array<number | null>) =>
    values.every((value): value is number => value !== null)
      ? values.reduce((sum, value) => sum + value, 0)
      : null;

  return {
    inputTokens: usages.reduce((sum, usage) => sum + usage.inputTokens, 0),
    outputTokens: usages.reduce((sum, usage) => sum + usage.outputTokens, 0),
    cost:
      currencies.size === 1
        ? sumOrNull(impacts.map((impact) => impact.cost))
        : null,
    currency: impacts[0]?.currency ?? "EUR",
    energyKwh: sumOrNull(impacts.map((impact) => impact.energyKwh)),
    co2Grams: sumOrNull(impacts.map((impact) => impact.co2Grams)),
  };
}
