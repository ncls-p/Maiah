import { and, eq } from "drizzle-orm";
import type { db } from "@/server/infrastructure/db";
import { aiModels } from "@/server/infrastructure/db/schema";
import {
  calculateTokenUsageImpact,
  parseSustainabilityConfig,
} from "@/modules/provider/model-runtime-config";

/** Price this run's own model usage inside its terminal transaction, never the tree total. */
export async function priceAgentRunUsage(
  transaction: Pick<typeof db, "select">,
  input: {
    modelId?: string;
    providerId?: string;
    inputTokens: number;
    outputTokens: number;
  },
) {
  const model = input.modelId
    ? (
        await transaction
          .select({
            inputTokenCost: aiModels.inputTokenCost,
            outputTokenCost: aiModels.outputTokenCost,
            sustainabilityConfigJson: aiModels.sustainabilityConfigJson,
          })
          .from(aiModels)
          .where(
            and(
              eq(aiModels.id, input.modelId),
              input.providerId
                ? eq(aiModels.providerId, input.providerId)
                : undefined,
            ),
          )
          .limit(1)
      )[0]
    : undefined;
  const sustainability = parseSustainabilityConfig(
    model?.sustainabilityConfigJson,
  );
  const impact = calculateTokenUsageImpact({
    inputTokens: input.inputTokens,
    outputTokens: input.outputTokens,
    inputCostPerMillion: model?.inputTokenCost,
    outputCostPerMillion: model?.outputTokenCost,
    sustainability,
    currency: sustainability.currency,
  });
  return {
    costUsd:
      impact.cost !== null && impact.currency === "USD"
        ? String(impact.cost)
        : null,
    metadataJson: {
      cost: impact.cost,
      currency: impact.currency,
      energyKwh: impact.energyKwh,
      co2Grams: impact.co2Grams,
      pricingSource: "model_configuration",
    },
  };
}
