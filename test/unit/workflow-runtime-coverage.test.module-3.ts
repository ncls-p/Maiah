import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { lookup } from "node:dns/promises";

import { executeAgent } from "@/modules/agent/runtime-executor";
import { executeCodeSandbox } from "@/modules/tool/code-sandbox";
import {
  createStarterDefinition,
  type WorkflowDefinition,
  type WorkflowNode,
  type WorkflowNodeType,
} from "@/modules/workflows/contracts";
import {
  WORKFLOW_NODE_REGISTRY,
  compileWorkflowDefinition,
  createWorkflowEventBus,
  createWorkflowRuntime,
  workflowNodeById,
} from "@/modules/workflows/runtime";
import { invokeNode } from "./workflow-runtime-coverage.test.dependencies";


describe("workflow text and number nodes", () => {
  it.each([
    ["uppercase", "  ADA  "],
    ["lowercase", "  ada  "],
    ["trim", "Ada"],
  ])("applies the %s text operation", async (operation, expected) => {
    await expect(
      invokeNode(
        "text.transform",
        { value: "  Ada  " },
        {
          path: "value",
          operation,
          outputPath: "result",
        },
      ),
    ).resolves.toMatchObject({ output: { result: expected } });
  });

  it("replaces text and leaves it unchanged without a search value", async () => {
    await expect(
      invokeNode(
        "text.transform",
        { value: "Ada Ada" },
        {
          path: "value",
          operation: "replace",
          search: "Ada",
          replacement: "Grace",
          outputPath: "result",
        },
      ),
    ).resolves.toMatchObject({ output: { result: "Grace Grace" } });
    await expect(
      invokeNode(
        "text.transform",
        { value: "Ada" },
        {
          path: "value",
          operation: "replace",
          search: "",
          outputPath: "result",
        },
      ),
    ).resolves.toMatchObject({ output: { result: "Ada" } });
  });

  it.each([
    ["add", 5, 2, 7],
    ["subtract", 5, 2, 3],
    ["multiply", 5, 2, 10],
    ["divide", 5, 2, 2.5],
    ["modulo", 5, 2, 1],
    ["round", 5.6, 0, 6],
  ])("calculates %s", async (operation, value, operand, expected) => {
    await expect(
      invokeNode(
        "number.calculate",
        { value },
        {
          path: "value",
          operation,
          operand,
          outputPath: "result",
        },
      ),
    ).resolves.toMatchObject({ output: { result: expected } });
  });

  it("rejects invalid calculations", async () => {
    await expect(
      invokeNode(
        "number.calculate",
        { value: "not-a-number" },
        {
          path: "value",
          operand: 1,
          outputPath: "result",
        },
      ),
    ).rejects.toThrow("finite numbers");
    await expect(
      invokeNode(
        "number.calculate",
        { value: 1 },
        {
          path: "value",
          operation: "divide",
          operand: 0,
          outputPath: "result",
        },
      ),
    ).rejects.toThrow("Division by zero");
  });
});
