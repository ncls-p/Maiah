"use client";



export const DAILY_FREQUENCY = "daily";
export type ScheduleFrequency = typeof DAILY_FREQUENCY | "interval";

export type ScheduledTask = {
  id: string;
  title: string;
  prompt: string;
  agentId: string;
  conversationId: string | null;
  frequency: ScheduleFrequency;
  timezone: string;
  timeOfDay: string | null;
  intervalMinutes: number | null;
  enabled: boolean;
  nextRunAt: string;
  lastStatus: string;
  lastError: string | null;
};

export function localTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

export function formatNextRun(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function statusVariant(status: string) {
  if (status === "failed") return "destructive" as const;
  if (status === "running") return "default" as const;
  if (status === "success") return "secondary" as const;
  return "outline" as const;
}

export function statusToneClass(status: string) {
  if (status === "running")
    return "border-primary/20 bg-primary/10 text-primary";
  return undefined;
}
