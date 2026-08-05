import { builtInToolInputSchemaJson } from "./builtin-tool-json-schema";
import type { ToolRiskLevel } from "./builtin-tools-catalog";
import { builtInTools } from "./builtin-tools.built-in-tools";

export function listBuiltInTools() {
  return builtInTools.map((tool) => ({
    id: tool.id,
    name: tool.name,
    displayName: tool.displayName,
    description: tool.description,
    riskLevel: tool.riskLevel,
    category: tool.category,
    inputSchemaJson: toolToJsonSchema(tool.id),
    requiresApprovalByDefault: requiresApproval(tool.riskLevel),
  }));
}

export function getBuiltInTool(toolId: string) {
  return builtInTools.find((tool) => tool.id === toolId) ?? null;
}

export function getBuiltInToolByName(name: string) {
  return builtInTools.find((tool) => tool.name === name) ?? null;
}

export function requiresApproval(riskLevel: ToolRiskLevel | string | null | undefined) {
  return riskLevel === "high" || riskLevel === "critical";
}

export function toolToJsonSchema(toolId: string) {
  const tool = getBuiltInTool(toolId);
  return tool ? builtInToolInputSchemaJson(tool.name) : null;
}
