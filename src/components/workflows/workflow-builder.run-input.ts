import type { WorkflowDefinition } from "@/modules/workflows/contracts";

export function formatWorkflowRunInput(
  value: WorkflowDefinition["defaultInput"],
) {
  return JSON.stringify(value, null, 2);
}

export function parseWorkflowRunInput(
  value: string,
):
  | { valid: true; input: WorkflowDefinition["defaultInput"] }
  | { valid: false } {
  try {
    return {
      valid: true,
      input: JSON.parse(value) as WorkflowDefinition["defaultInput"],
    };
  } catch {
    return { valid: false };
  }
}
