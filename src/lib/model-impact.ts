export type ModelImpactData = {
  inputTokenCost?: string | null;
  outputTokenCost?: string | null;
  sustainabilityConfigJson?: {
    currency?: string;
    co2GramsPerMillionTokens?: number;
  } | null;
};

export function formatModelImpact(model: ModelImpactData, locale: string) {
  const configuredCurrency = model.sustainabilityConfigJson?.currency
    ?.trim()
    .toUpperCase();
  const currency =
    configuredCurrency && /^[A-Z]{3}$/.test(configuredCurrency)
      ? configuredCurrency
      : "EUR";
  const priceFormat = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    currencyDisplay: "code",
    maximumSignificantDigits: 4,
  });
  const price = (value: string | null | undefined) => {
    if (!value?.trim()) return null;
    const amount = Number(value);
    return Number.isFinite(amount) && amount >= 0
      ? priceFormat.format(amount)
      : null;
  };
  const carbon = model.sustainabilityConfigJson?.co2GramsPerMillionTokens;
  return {
    input: price(model.inputTokenCost),
    output: price(model.outputTokenCost),
    carbon:
      typeof carbon === "number" && Number.isFinite(carbon) && carbon >= 0
        ? new Intl.NumberFormat(locale, { maximumSignificantDigits: 4 }).format(
            carbon,
          )
        : null,
  };
}
