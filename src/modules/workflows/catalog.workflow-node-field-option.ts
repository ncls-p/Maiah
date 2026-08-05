import type { WorkflowNodeType } from "./contracts";

export type WorkflowNodeFieldOption = {
  value: string;
  label: string;
};

export type WorkflowNodeField = {
  key: string;
  control:
    | "text"
    | "textarea"
    | "number"
    | "select"
    | "json"
    | "keyValue"
    | "stringList"
    | "agent"
    | "code";
  label: string;
  description?: string;
  placeholder?: string;
  options?: readonly WorkflowNodeFieldOption[];
  min?: number;
  max?: number;
  step?: number;
  advanced?: boolean;
  showWhen?: { key: string; equals: unknown };
};

export type WorkflowNodeCatalogItem = {
  type: WorkflowNodeType;
  label: string;
  description: string;
  category: "trigger" | "data" | "logic" | "integration" | "ai" | "code";
  defaultParameters: Record<string, unknown>;
  fields: readonly WorkflowNodeField[];
};

export const pathField = (key = "path"): WorkflowNodeField => ({
  key,
  control: "text",
  label: key,
  description: "pathHint",
  placeholder: "pathPlaceholder",
});

export const outputPathField: WorkflowNodeField = {
  key: "outputPath",
  control: "text",
  label: "outputPath",
  description: "outputPathHint",
  placeholder: "outputPathPlaceholder",
};

export const comparisonOptions = [
  { value: "equals", label: "equals" },
  { value: "notEquals", label: "notEquals" },
  { value: "contains", label: "contains" },
  { value: "startsWith", label: "startsWith" },
  { value: "greaterThan", label: "greaterThan" },
  { value: "lessThan", label: "lessThan" },
  { value: "exists", label: "exists" },
  { value: "isEmpty", label: "isEmpty" },
] as const;
