import { z } from "zod";

const optionalNonNegativeNumber = z.number().finite().nonnegative().optional();

export const imageGenerationConfigSchema = z.object({
  enabled: z.boolean().default(false),
  isDefault: z.boolean().default(false),
  defaultSize: z
    .string()
    .regex(/^\d{2,5}x\d{2,5}$/)
    .default("1024x1024"),
  allowedSizes: z
    .array(z.string().regex(/^\d{2,5}x\d{2,5}$/))
    .min(1)
    .max(12)
    .default(["1024x1024"]),
  costPerImage: optionalNonNegativeNumber,
  energyKwhPerImage: optionalNonNegativeNumber,
  co2GramsPerImage: optionalNonNegativeNumber,
  currency: z.string().trim().min(3).max(3).default("EUR"),
});

export const sustainabilityConfigSchema = z.object({
  energyKwhPerMillionTokens: optionalNonNegativeNumber,
  co2GramsPerMillionTokens: optionalNonNegativeNumber,
  source: z.string().trim().max(255).optional(),
  manualOverride: z.boolean().optional(),
  currency: z.string().trim().min(3).max(3).default("EUR"),
});

export type ImageGenerationConfig = z.infer<typeof imageGenerationConfigSchema>;
export type SustainabilityConfig = z.infer<typeof sustainabilityConfigSchema>;

export function parseImageGenerationConfig(value: unknown) {
  const parsed = imageGenerationConfigSchema.safeParse(value);
  return parsed.success ? parsed.data : imageGenerationConfigSchema.parse({});
}

export function parseSustainabilityConfig(value: unknown) {
  const parsed = sustainabilityConfigSchema.safeParse(value);
  return parsed.success ? parsed.data : sustainabilityConfigSchema.parse({});
}

export type UsageImpact = {
  inputTokens: number;
  outputTokens: number;
  cost: number | null;
  currency: string;
  energyKwh: number | null;
  co2Grams: number | null;
};

function configuredNumber(value: string | null | undefined) {
  if (!value?.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function calculateTokenUsageImpact(input: {
  inputTokens: number;
  outputTokens: number;
  inputCostPerMillion?: string | null;
  outputCostPerMillion?: string | null;
  sustainability?: unknown;
  currency?: string;
  co2GramsPerKwh?: number;
}): UsageImpact {
  const inputTokens = Math.max(0, input.inputTokens);
  const outputTokens = Math.max(0, input.outputTokens);
  const inputCost = configuredNumber(input.inputCostPerMillion);
  const outputCost = configuredNumber(input.outputCostPerMillion);
  const sustainability = parseSustainabilityConfig(input.sustainability);
  const totalTokens = inputTokens + outputTokens;

  const energyKwh =
    sustainability.energyKwhPerMillionTokens === undefined
      ? null
      : (totalTokens * sustainability.energyKwhPerMillionTokens) / 1_000_000;
  const configuredCo2Grams =
    sustainability.co2GramsPerMillionTokens === undefined
      ? null
      : (totalTokens * sustainability.co2GramsPerMillionTokens) / 1_000_000;

  return {
    inputTokens,
    outputTokens,
    cost:
      inputCost === null && outputCost === null
        ? null
        : (inputTokens * (inputCost ?? 0) + outputTokens * (outputCost ?? 0)) /
          1_000_000,
    currency: input.currency ?? "EUR",
    energyKwh,
    co2Grams:
      configuredCo2Grams ??
      (energyKwh !== null && input.co2GramsPerKwh !== undefined
        ? energyKwh * input.co2GramsPerKwh
        : null),
  };
}

export function calculateImageUsageImpact(
  configValue: unknown,
  co2GramsPerKwh?: number,
) {
  const config = parseImageGenerationConfig(configValue);
  const energyKwh = config.energyKwhPerImage ?? null;
  return {
    cost: config.costPerImage ?? null,
    currency: config.currency,
    energyKwh,
    co2Grams:
      config.co2GramsPerImage ??
      (energyKwh !== null && co2GramsPerKwh !== undefined
        ? energyKwh * co2GramsPerKwh
        : null),
  };
}
