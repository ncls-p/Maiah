import { z } from "zod";
import { workflowDefinitionSchema } from "./contracts";

export const workflowToolSchemas = {
  workflow_catalog: z.object({}).strict(),
  workflow_list: z.object({ query: z.string().max(200).default("") }).strict(),
  workflow_get: z.object({ workflowId: z.uuid() }).strict(),
  workflow_create: z
    .object({
      name: z.string().trim().min(1).max(255),
      description: z.string().max(2_000).optional(),
      definition: workflowDefinitionSchema,
    })
    .strict(),
  workflow_update: z
    .object({
      workflowId: z.uuid(),
      name: z.string().trim().min(1).max(255).optional(),
      description: z.string().max(2_000).optional(),
      definition: workflowDefinitionSchema,
    })
    .strict(),
  workflow_publish: z.object({ workflowId: z.uuid() }).strict(),
  workflow_run: z
    .object({
      workflowId: z.uuid(),
      input: z.json().optional(),
      idempotencyKey: z
        .string()
        .trim()
        .min(1)
        .max(200)
        .describe(
          "Stable unique key for this logical execution. Reuse it on retries; change it for a new run.",
        ),
    })
    .strict(),
  workflow_run_status: z.object({ runId: z.uuid() }).strict(),
};

export type WorkflowToolName = keyof typeof workflowToolSchemas;

export const WORKFLOW_TOOL_SUMMARIES = [
  {
    name: "workflow_catalog",
    displayName: "Workflow building blocks",
    riskLevel: "low",
    description:
      "Read Maiah workflow node types, definition schema and available assistants. Use before creating a workflow from a user's prompt. Agent steps use each selected assistant's configured tools and the initiating user's connections.",
  },
  {
    name: "workflow_list",
    displayName: "Find workflows",
    riskLevel: "low",
    description:
      "Find accessible Maiah workflows by name or description in the current workspace.",
  },
  {
    name: "workflow_get",
    displayName: "Read workflow",
    riskLevel: "low",
    description:
      "Read a Maiah workflow definition and its draft/published version information.",
  },
  {
    name: "workflow_create",
    displayName: "Create workflow",
    riskLevel: "medium",
    description:
      "Create a Maiah workflow draft from the user's request. Read workflow_catalog first, build the definition, then call this tool. Does not publish or execute it.",
  },
  {
    name: "workflow_update",
    displayName: "Edit workflow",
    riskLevel: "medium",
    description:
      "Save a new Maiah workflow draft definition. Read workflow_get first and preserve unrelated steps. Does not execute the workflow.",
  },
  {
    name: "workflow_publish",
    displayName: "Publish workflow",
    riskLevel: "medium",
    description:
      "Validate and publish the latest workflow draft so it can be triggered by assistants or the API. Does not execute it.",
  },
  {
    name: "workflow_run",
    displayName: "Run workflow",
    riskLevel: "high",
    description:
      "Queue the published Maiah workflow for execution. May trigger external actions through its steps and assistants' configured tools. Returns a run ID; follow with workflow_run_status. Reuse the same idempotencyKey when retrying the same execution.",
  },
  {
    name: "workflow_run_status",
    displayName: "Workflow execution status",
    riskLevel: "low",
    description:
      "Read a Maiah workflow run's status, step outputs and errors. A queued run is not completed; do not claim success until its status is completed.",
  },
].map((tool, index) => ({
  ...tool,
  name: tool.name as WorkflowToolName,
  riskLevel: tool.riskLevel as "low" | "medium" | "high",
  id: `00000000-0000-4000-8000-${String(101 + index).padStart(12, "0")}`,
  category: "Workflows",
}));
