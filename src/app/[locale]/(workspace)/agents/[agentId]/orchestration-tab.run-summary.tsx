"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import type { OrchestrationPolicy } from "./types";

export type RunSummary = {
  id: string;
  status: string;
  trigger: string;
  inputPreviewJson?: { prompt?: string } | null;
  outputPreviewJson?: { text?: string } | null;
  inputTokens: number | null;
  outputTokens: number | null;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
};

export const statusTone: Record<string, string> = {
  success: "border-success/30 bg-success/10 text-success",
  failed: "border-destructive/30 bg-destructive/10 text-destructive",
  cancelled: "border-border bg-muted text-muted-foreground",
  timed_out: "border-warning/30 bg-warning/10 text-warning",
  running: "border-info/30 bg-info/10 text-info",
  queued: "border-info/30 bg-info/10 text-info",
};

export function policyField(
  policy: OrchestrationPolicy,
  setPolicy: (policy: OrchestrationPolicy) => void,
  key: keyof OrchestrationPolicy,
  label: string,
  min: number,
  max: number,
  step = 1,
  description?: string,
) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={`orchestration-${key}`}>{label}</Label>
      <Input
        id={`orchestration-${key}`}
        name={`orchestration-${key}`}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={step}
        value={policy[key]}
        onChange={(event) =>
          setPolicy({
            ...policy,
            [key]: Math.max(min, Math.min(max, Number(event.target.value))),
          })
        }
      />
      {description ? (
        <p className="text-xs text-muted-foreground">{description}</p>
      ) : null}
    </div>
  );
}
