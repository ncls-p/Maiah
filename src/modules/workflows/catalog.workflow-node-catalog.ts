import { WORKFLOW_NODE_CATALOGPart1 } from "./catalog.workflow-node-catalog.part-1";
import { WORKFLOW_NODE_CATALOGPart2 } from "./catalog.workflow-node-catalog.part-2";
import type { WorkflowNodeCatalogItem } from "./catalog.workflow-node-field-option";

export const WORKFLOW_NODE_CATALOG: readonly WorkflowNodeCatalogItem[] = [
  ...WORKFLOW_NODE_CATALOGPart1,
  ...WORKFLOW_NODE_CATALOGPart2,
] as const;
