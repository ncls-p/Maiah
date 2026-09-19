"use client";

import { useLocale, useTranslations } from "next-intl";
import { formatModelImpact, type ModelImpactData } from "@/lib/model-impact";

export function ModelImpact({
  model,
  id,
}: {
  model: ModelImpactData;
  id: string;
}) {
  const locale = useLocale();
  const t = useTranslations("agents.model.impact");
  const impact = formatModelImpact(model, locale);
  return (
    <span
      id={id}
      className="grid gap-1 whitespace-normal text-xs text-muted-foreground tabular-nums"
    >
      <span>
        {t("prices", {
          input: impact.input ?? t("unknown"),
          output: impact.output ?? t("unknown"),
        })}
      </span>
      <span>
        {impact.carbon === null
          ? t("carbonUnknown")
          : t("carbon", { value: impact.carbon })}
      </span>
    </span>
  );
}
