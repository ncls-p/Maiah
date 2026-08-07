import { tool } from "ai";
import { z } from "zod";

import {
  workflowDefinitionSchema,
  workflowEdgeSchema,
  workflowNodeSchema,
} from "@/modules/workflows/contracts";

import { WorkflowAgenticState } from "./route.agentic-state";

export function createWorkflowEditTools(state: WorkflowAgenticState) {
  return {
    update_workflow_details: tool({
      description:
        "Update the current workflow name or description without changing its graph.",
      inputSchema: z
        .object({
          name: z.string().trim().min(1).max(255).optional(),
          description: z.string().trim().max(2_000).nullable().optional(),
        })
        .refine(
          (value) =>
            value.name !== undefined || value.description !== undefined,
          "Provide a name or description.",
        ),
      execute: async (input) => {
        state.changeDraft({
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.description !== undefined
            ? { description: input.description }
            : {}),
        });
        return { ok: true, revision: state.revision };
      },
    }),
    update_workflow_input: tool({
      description:
        "Set the workflow's saved default JSON input. Users can still override this value before each test or API run.",
      inputSchema: z.object({ input: z.json() }),
      execute: async ({ input }) => {
        state.setParsedDefinition({
          ...state.draft.definition,
          defaultInput: input,
        });
        return {
          ok: true,
          revision: state.revision,
          defaultInput: state.draft.definition.defaultInput,
        };
      },
    }),
    replace_workflow: tool({
      description:
        "Replace the complete workflow graph with a valid new definition.",
      inputSchema: z.object({
        summary: z.string().trim().min(1).max(240),
        definition: workflowDefinitionSchema,
      }),
      execute: async ({ definition, summary }) => {
        state.replaceDefinition(definition);
        return {
          ok: true,
          revision: state.revision,
          summary,
          nodeCount: state.draft.definition.nodes.length,
          edgeCount: state.draft.definition.edges.length,
        };
      },
    }),
    upsert_workflow_nodes: tool({
      description:
        "Add new workflow steps or replace existing steps by id while preserving all other steps and connections.",
      inputSchema: z.object({
        summary: z.string().trim().min(1).max(240),
        nodes: z.array(workflowNodeSchema).min(1).max(20),
      }),
      execute: async ({ nodes }) => {
        const byId = new Map(
          state.draft.definition.nodes.map((node) => [node.id, node]),
        );
        for (const node of nodes) byId.set(node.id, node);
        state.setParsedDefinition({
          ...state.draft.definition,
          nodes: Array.from(byId.values()),
        });
        return {
          ok: true,
          revision: state.revision,
          updatedNodeIds: nodes.map((node) => node.id),
        };
      },
    }),
    remove_workflow_nodes: tool({
      description:
        "Remove workflow steps by id and remove their attached connections. The manual trigger cannot be removed.",
      inputSchema: z.object({
        nodeIds: z.array(z.string().trim().min(1).max(128)).min(1).max(20),
      }),
      execute: async ({ nodeIds }) => {
        const removedIds = new Set(nodeIds);
        if (
          state.draft.definition.nodes.some(
            (node) => removedIds.has(node.id) && node.type === "trigger.manual",
          )
        )
          throw new Error("The manual trigger cannot be removed.");
        state.setParsedDefinition({
          ...state.draft.definition,
          nodes: state.draft.definition.nodes.filter(
            (node) => !removedIds.has(node.id),
          ),
          edges: state.draft.definition.edges.filter(
            (edge) =>
              !removedIds.has(edge.source) && !removedIds.has(edge.target),
          ),
        });
        return { ok: true, revision: state.revision, removedNodeIds: nodeIds };
      },
    }),
    connect_workflow_nodes: tool({
      description:
        "Replace all workflow connections using only source and target step IDs. For a condition step, set outcome to true or false; omit outcome for every other step. Edge IDs are generated automatically. Include every connection needed to make all useful steps reachable from the manual trigger.",
      inputSchema: z.object({
        connections: z
          .array(
            z.object({
              source: z.string().trim().min(1).max(128),
              target: z.string().trim().min(1).max(128),
              outcome: z.enum(["true", "false", ""]).nullable().optional(),
            }),
          )
          .max(300),
      }),
      execute: async ({ connections }) => {
        state.replaceDefinition({
          ...state.draft.definition,
          edges: connections.map((connection, index) => ({
            id: `edge-${index + 1}-${crypto.randomUUID()}`,
            source: connection.source,
            target: connection.target,
            sourceHandle:
              connection.outcome === "" || connection.outcome === undefined
                ? null
                : connection.outcome,
          })),
        });
        return {
          ok: true,
          revision: state.revision,
          edgeCount: state.draft.definition.edges.length,
        };
      },
    }),
    replace_workflow_edges: tool({
      description:
        "Low-level fallback that replaces all workflow connections with explicit edge IDs. Prefer connect_workflow_nodes.",
      inputSchema: z.object({ edges: z.array(workflowEdgeSchema).max(300) }),
      execute: async ({ edges }) => {
        state.setParsedDefinition({ ...state.draft.definition, edges });
        return { ok: true, revision: state.revision, edgeCount: edges.length };
      },
    }),
  };
}
