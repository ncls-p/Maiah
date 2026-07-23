import { z } from "zod";

import { WORKFLOW_NODE_CATALOG } from "./catalog";
import {
  workflowDefinitionSchema,
  workflowEdgeSchema,
  workflowNodeSchema,
  type WorkflowDefinition,
} from "./contracts";
import { compileWorkflowDefinition } from "./runtime";

export const workflowAgenticMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(8_000),
});

const workflowAgenticDraftDefinitionSchema = z.object({
  schemaVersion: z.literal(1),
  nodes: z
    .array(
      workflowNodeSchema.extend({
        label: z.string().trim().max(120),
      }),
    )
    .min(1)
    .max(100),
  edges: z.array(workflowEdgeSchema).max(300),
});

export const workflowAgenticRequestSchema = z.object({
  workspaceId: z.uuid(),
  messages: z.array(workflowAgenticMessageSchema).min(1).max(20),
  draft: z.object({
    name: z.string().trim().max(255),
    description: z.string().trim().max(2_000).nullable(),
    definition: workflowAgenticDraftDefinitionSchema,
  }),
});

export type WorkflowAgenticMessage = z.infer<
  typeof workflowAgenticMessageSchema
>;

export type WorkflowAgenticDraft = {
  name: string;
  description: string | null;
  definition: WorkflowDefinition;
};

export type WorkflowAgenticStreamEvent =
  | { type: "agent"; name: string }
  | {
      type: "tool_start";
      id: string;
      toolName: string;
      label: string;
    }
  | {
      type: "tool_result";
      id: string;
      toolName: string;
      label: string;
    }
  | { type: "workflow"; draft: WorkflowAgenticDraft }
  | { type: "text"; delta: string }
  | { type: "saved"; workflow: unknown }
  | { type: "done" }
  | { type: "error"; message: string };

export const workflowAgentToolLabels: Record<string, string> = {
  update_workflow_details: "Updating workflow details",
  replace_workflow: "Building the workflow",
  upsert_workflow_nodes: "Updating workflow steps",
  remove_workflow_nodes: "Removing workflow steps",
  replace_workflow_edges: "Connecting workflow steps",
  validate_workflow: "Validating the workflow",
};

function promptValue(value: unknown, depth = 0): unknown {
  if (depth >= 6) return "[nested value omitted]";
  if (typeof value === "string") {
    if (value.length <= 2_000) return value;
    return `${value.slice(0, 2_000)}\n[… ${value.length - 2_000} characters omitted; preserve this value with granular tools …]`;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => promptValue(item, depth + 1));
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 100)
        .map(([key, item]) => [key, promptValue(item, depth + 1)]),
    );
  }
  return value;
}

export function workflowAgentPromptDraft(draft: WorkflowAgenticDraft) {
  return {
    ...draft,
    definition: {
      ...draft.definition,
      nodes: draft.definition.nodes.map((node) => ({
        ...node,
        parameters: promptValue(node.parameters),
      })),
    },
  };
}

export function workflowAgentCatalogPrompt() {
  return WORKFLOW_NODE_CATALOG.map((item) => ({
    type: item.type,
    description: item.description,
    defaultParameters: item.defaultParameters,
    fields: item.fields.map((field) => ({
      key: field.key,
      control: field.control,
      options: field.options?.map((option) => option.value),
    })),
  }));
}

export function validateWorkflowAgentDraft(input: {
  workflowId: string;
  version: number;
  definition: unknown;
  availableAgentIds: Set<string>;
}) {
  const definition = workflowDefinitionSchema.parse(input.definition);
  for (const node of definition.nodes) {
    if (
      node.type === "agent.run" &&
      !input.availableAgentIds.has(String(node.parameters.agentId ?? ""))
    ) {
      throw new Error(
        `Node '${node.label}' references an unavailable assistant.`,
      );
    }
  }
  return compileWorkflowDefinition({
    workflowId: input.workflowId,
    version: input.version,
    definition,
  }).definition;
}
