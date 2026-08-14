"use client";

import { BrainCircuitIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import type { ReasoningPreset } from "@/modules/agent/reasoning-presets";

export function ChatReasoningSlider({
  presets,
  value,
  disabled,
  onChange,
}: {
  presets: ReasoningPreset[];
  value: ReasoningPreset;
  disabled?: boolean;
  onChange: (value: ReasoningPreset) => void;
}) {
  const t = useTranslations("chat.composer");
  const index = Math.max(0, presets.indexOf(value));
  const valueLabel = t(`reasoningLevels.${value}`);

  return (
    <label
      className="flex min-h-10 min-w-0 shrink items-center gap-1.5 rounded-xl px-1.5 text-muted-foreground sm:px-2"
      title={t("reasoningSelected", { level: valueLabel })}
    >
      <BrainCircuitIcon className="size-4 shrink-0" aria-hidden="true" />
      <span className="sr-only">{t("reasoningLevel")}</span>
      <input
        type="range"
        min={0}
        max={Math.max(0, presets.length - 1)}
        step={1}
        value={index}
        disabled={disabled}
        aria-label={t("reasoningLevel")}
        aria-valuetext={valueLabel}
        onChange={(event) => onChange(presets[Number(event.target.value)]!)}
        className="h-10 w-[clamp(4.5rem,18vw,7.5rem)] cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-50"
      />
      <span className="hidden max-w-16 truncate text-[11px] font-medium text-foreground sm:block">
        {valueLabel}
      </span>
    </label>
  );
}
