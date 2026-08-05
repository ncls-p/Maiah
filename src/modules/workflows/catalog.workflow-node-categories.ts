import { WORKFLOW_NODE_CATALOG } from "./catalog.workflow-node-catalog";
import type { WorkflowNodeType } from "./contracts";

export const WORKFLOW_NODE_CATEGORIES = ["all", "trigger", "ai", "integration", "data", "logic", "code"] as const;

export type WorkflowNodeCategory = (typeof WORKFLOW_NODE_CATEGORIES)[number];

export function workflowNodeCatalogItem(type: WorkflowNodeType) {
  const item = WORKFLOW_NODE_CATALOG.find((candidate) => candidate.type === type);
  if (!item) throw new Error(`Unknown workflow node type: ${type}`);
  return item;
}
