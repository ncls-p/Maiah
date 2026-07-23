import { describe, expect, it } from "vitest";

import {
  validateWorkflowAgentDraft,
  workflowAgentCatalogPrompt,
  workflowAgenticRequestSchema,
} from "@/modules/workflows/agentic";
import {
  createStarterDefinition,
  type WorkflowDefinition,
} from "@/modules/workflows/contracts";

const workspaceId = "9df25190-0187-4fb8-96a7-7439debc1f93";
const workflowId = "2e74eae6-e806-4ede-95c5-bb634f6709e4";
const agentId = "d23e39a7-5a5a-433b-b34e-a556875a1c2f";

describe("workflow agentic mode", () => {
  it("accepts one user turn and the current visual draft", () => {
    const parsed = workflowAgenticRequestSchema.parse({
      workspaceId,
      message: "Build a summary workflow",
      draft: {
        name: "",
        description: null,
        definition: {
          ...createStarterDefinition(),
          nodes: createStarterDefinition().nodes.map((node) => ({
            ...node,
            label: "",
          })),
        },
      },
    });

    expect(parsed.message).toBe("Build a summary workflow");
    expect(parsed.draft.definition.nodes[0]?.type).toBe("trigger.manual");
    expect(() =>
      workflowAgenticRequestSchema.parse({
        ...parsed,
        inputRequestId: "d23e39a7-5a5a-433b-b34e-a556875a1c2f",
      }),
    ).toThrow();
  });

  it("validates generated graphs and restricts assistant references", () => {
    const definition: WorkflowDefinition = {
      schemaVersion: 1,
      nodes: [
        ...createStarterDefinition().nodes,
        {
          id: "summarize",
          type: "agent.run",
          label: "Prepare summary",
          position: { x: 360, y: 180 },
          parameters: {
            agentId,
            prompt: "Summarize this input:\n{{input}}",
          },
          settings: {
            timeoutMs: 30_000,
            maxRetries: 0,
            retryDelayMs: 1_000,
          },
        },
      ],
      edges: [
        {
          id: "edge-trigger-summarize",
          source: "trigger",
          target: "summarize",
          sourceHandle: null,
        },
      ],
    };

    expect(
      validateWorkflowAgentDraft({
        workflowId,
        version: 2,
        definition,
        availableAgentIds: new Set([agentId]),
      }),
    ).toEqual(definition);
    expect(() =>
      validateWorkflowAgentDraft({
        workflowId,
        version: 2,
        definition,
        availableAgentIds: new Set(),
      }),
    ).toThrow("references an unavailable assistant");
  });

  it("gives the builder every supported step with safe defaults", () => {
    const catalog = workflowAgentCatalogPrompt();

    expect(catalog.some((item) => item.type === "trigger.manual")).toBe(true);
    expect(catalog.some((item) => item.type === "agent.run")).toBe(true);
    expect(catalog.some((item) => item.type === "code.execute")).toBe(true);
    expect(catalog).toHaveLength(20);
  });
});
