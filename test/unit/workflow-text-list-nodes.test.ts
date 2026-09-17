import { describe, expect, it, vi } from "vitest";
vi.mock("@/modules/agent/runtime-executor", () => ({ executeAgent: vi.fn() }));
vi.mock("@/modules/tool/code-sandbox", () => ({ executeCodeSandbox: vi.fn() }));
import { createStarterDefinition } from "@/modules/workflows/contracts";
import {
  compileWorkflowDefinition,
  createWorkflowRuntime,
} from "@/modules/workflows/runtime";

const settings = { timeoutMs: 30_000, maxRetries: 0, retryDelayMs: 1_000 };
describe("text and list workflow nodes", () => {
  it("splits and joins through the compiled runtime without losing other fields", async () => {
    const { blueprint } = compileWorkflowDefinition({
      workflowId: "workflow",
      version: 1,
      definition: {
        ...createStarterDefinition(),
        nodes: [
          ...createStarterDefinition().nodes,
          {
            id: "split",
            type: "text.split",
            label: "Split",
            position: { x: 100, y: 0 },
            settings,
            parameters: { path: "text", separator: ",", outputPath: "items" },
          },
          {
            id: "join",
            type: "list.join",
            label: "Join",
            position: { x: 200, y: 0 },
            settings,
            parameters: {
              path: "items",
              separator: " / ",
              outputPath: "result",
            },
          },
        ],
        edges: [
          { id: "a", source: "trigger", target: "split" },
          { id: "b", source: "split", target: "join" },
        ],
      },
    });
    const runtime = createWorkflowRuntime({
      dependencies: {
        workspaceId: "w",
        workflowId: "workflow",
        runId: "run",
        userId: "user",
      },
    });
    const result = await runtime.run(blueprint, {
      input: { text: "a,b,c", retained: true },
    });
    expect(result.status).toBe("completed");
    expect(result.context.join).toEqual({
      text: "a,b,c",
      retained: true,
      items: ["a", "b", "c"],
      result: "a / b / c",
    });
  });
  it("rejects incomplete output configuration before running", () => {
    expect(() =>
      compileWorkflowDefinition({
        workflowId: "w",
        version: 1,
        definition: {
          ...createStarterDefinition(),
          nodes: [
            ...createStarterDefinition().nodes,
            {
              id: "join",
              type: "list.join",
              label: "Join",
              position: { x: 100, y: 0 },
              settings,
              parameters: { path: "items" },
            },
          ],
          edges: [{ id: "a", source: "trigger", target: "join" }],
        },
      }),
    ).toThrow(/output path/);
  });
});
