"use client";

export const approvalRiskLevels = ["low", "medium", "high", "critical"] as const;
export const approvalSources = ["builtin", "custom", "mcp"] as const;

export function parseTextList(value: string) {
  return value
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}
