/** Client-safe builtin tool metadata (no env or server-only imports). */

export type ToolRiskLevel = "low" | "medium" | "high" | "critical";

export const MEDIUM_RISK_LEVEL = "medium";

export type BuiltInToolSummary = {
  id: string;
  name: string;
  displayName: string;
  description: string;
  riskLevel: ToolRiskLevel;
  category: string;
};
