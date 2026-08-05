"use client";


export function statusVariant(status: string) {
  if (status === "ready") return "secondary" as const;
  if (status === "processing") return "outline" as const;
  return "destructive" as const;
}

export function statusLabel(status: string, t: (key: string) => string) {
  if (status === "ready") return t("statusReady");
  if (status === "processing") return t("statusProcessing");
  return t("statusFailed");
}
