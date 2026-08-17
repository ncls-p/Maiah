"use client";

import { BrainCircuitIcon, ChevronDownIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo, useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { ReasoningPreset } from "@/modules/agent/reasoning-presets";

function indexFromPointer(
  event: React.PointerEvent<HTMLElement>,
  count: number,
) {
  const rect = event.currentTarget.getBoundingClientRect();
  const ratio =
    rect.width <= 0
      ? 0
      : Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1);
  return Math.round(ratio * Math.max(0, count - 1));
}

function ReasoningMobilePicker({
  presets,
  value,
  disabled,
  valueLabel,
  onChange,
}: {
  presets: ReasoningPreset[];
  value: ReasoningPreset;
  disabled?: boolean;
  valueLabel: string;
  onChange: (value: ReasoningPreset) => void;
}) {
  const t = useTranslations("chat.composer");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          data-slot="chat-reasoning-picker"
          className="h-10 max-w-[9.75rem] min-w-0 gap-1.5 rounded-xl px-2.5 text-xs font-medium"
          aria-label={t("reasoningLevel")}
          disabled={disabled}
        >
          <BrainCircuitIcon className="size-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 truncate">{valueLabel}</span>
          <ChevronDownIcon
            className="size-3.5 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top" className="min-w-44">
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(next) => {
            if (presets.includes(next as ReasoningPreset)) {
              onChange(next as ReasoningPreset);
            }
          }}
        >
          {presets.map((preset) => (
            <DropdownMenuRadioItem
              key={preset}
              value={preset}
              className="min-h-10"
              disabled={disabled}
            >
              {t(`reasoningLevels.${preset}`)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export const ChatReasoningSlider = memo(function ChatReasoningSlider({
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
  const draggingRef = useRef(false);
  const draftRef = useRef(value);
  const [draft, setDraft] = useState(value);
  const [tooltipOpen, setTooltipOpen] = useState(false);

  useEffect(() => {
    if (draggingRef.current) return;
    draftRef.current = value;
    setDraft(value);
  }, [value]);

  const max = Math.max(1, presets.length - 1);
  const index = Math.max(0, presets.indexOf(draft));
  const percent = (index / max) * 100;
  const valueLabel = t(`reasoningLevels.${draft}`);

  const preview = useCallback(
    (nextIndex: number) => {
      const next = presets[nextIndex]!;
      draftRef.current = next;
      setDraft(next);
    },
    [presets],
  );

  const commit = useCallback(
    (next: ReasoningPreset) => {
      draftRef.current = next;
      setDraft(next);
      if (next !== value) onChange(next);
    },
    [onChange, value],
  );

  return (
    <>
      <div className="sm:hidden">
        <ReasoningMobilePicker
          presets={presets}
          value={value}
          disabled={disabled}
          valueLabel={valueLabel}
          onChange={onChange}
        />
      </div>
      <Tooltip
        open={tooltipOpen}
        onOpenChange={(open) => {
          if (draggingRef.current) {
            setTooltipOpen(false);
            return;
          }
          setTooltipOpen(open);
        }}
      >
        <TooltipTrigger asChild>
          <label className="hidden min-h-10 w-auto min-w-0 items-center gap-1.5 rounded-xl px-2 text-muted-foreground sm:flex">
            <BrainCircuitIcon className="size-4 shrink-0" aria-hidden="true" />
            <span className="sr-only">{t("reasoningLevel")}</span>
            <div
              role="slider"
              tabIndex={disabled ? -1 : 0}
              aria-disabled={disabled || undefined}
              aria-label={t("reasoningLevel")}
              aria-valuemin={0}
              aria-valuemax={max}
              aria-valuenow={index}
              aria-valuetext={valueLabel}
              className="relative h-10 w-[clamp(5.5rem,18vw,7.5rem)] max-w-[7.5rem] shrink-0 touch-none select-none outline-none focus-visible:ring-2 focus-visible:ring-ring/50 data-[disabled=true]:opacity-50"
              data-disabled={disabled ? "true" : undefined}
              onPointerDown={(event) => {
                if (disabled) return;
                draggingRef.current = true;
                setTooltipOpen(false);
                event.currentTarget.setPointerCapture(event.pointerId);
                preview(indexFromPointer(event, presets.length));
              }}
              onPointerMove={(event) => {
                if (!draggingRef.current) return;
                preview(indexFromPointer(event, presets.length));
              }}
              onPointerUp={() => {
                draggingRef.current = false;
                commit(draftRef.current);
              }}
              onPointerCancel={() => {
                draggingRef.current = false;
                commit(draftRef.current);
              }}
              onKeyDown={(event) => {
                if (disabled) return;
                const delta =
                  event.key === "ArrowRight" || event.key === "ArrowUp"
                    ? 1
                    : event.key === "ArrowLeft" || event.key === "ArrowDown"
                      ? -1
                      : event.key === "Home"
                        ? -index
                        : event.key === "End"
                          ? max - index
                          : 0;
                if (!delta) return;
                event.preventDefault();
                const nextIndex = Math.min(max, Math.max(0, index + delta));
                commit(presets[nextIndex]!);
              }}
            >
              <span className="pointer-events-none absolute inset-x-1.5 top-1/2 h-1 -translate-y-1/2 rounded-full bg-muted" />
              <span
                className="pointer-events-none absolute top-1/2 left-1.5 h-1 origin-left rounded-full bg-primary"
                style={{
                  width: "calc(100% - 0.75rem)",
                  transform: `translateY(-50%) scaleX(${percent / 100})`,
                }}
              />
              <span
                className="pointer-events-none absolute top-1/2 size-3.5 rounded-full bg-primary shadow-[0_0_0_3px_color-mix(in_oklch,var(--background)_88%,transparent)]"
                style={{
                  left: `calc(0.375rem + (100% - 0.75rem) * ${percent / 100})`,
                  transform: "translate(-50%, -50%)",
                }}
              />
            </div>
            <span className="w-[5.75rem] shrink-0 truncate text-[11px] font-medium text-foreground">
              {valueLabel}
            </span>
          </label>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={8}>
          {t("reasoningSelected", { level: valueLabel })}
        </TooltipContent>
      </Tooltip>
    </>
  );
});
