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


describe("workflow list and logic nodes", () => {
  it.each([
    ["equals", 2, [2]],
    ["notEquals", 2, [1, 3]],
    ["greaterThan", 2, [3]],
    ["lessThan", 2, [1]],
    ["contains", "alp", ["alpha"]],
    ["startsWith", "be", ["beta"]],
  ])("filters scalar lists with %s", async (operator, value, expected) => {
    const list =
      operator === "contains" || operator === "startsWith"
        ? ["alpha", "beta", "gamma"]
        : [1, 2, 3];
    await expect(
      invokeNode(
        "list.filter",
        { list },
        {
          path: "list",
          field: "",
          operator,
          value,
          outputPath: "result",
        },
      ),
    ).resolves.toMatchObject({ output: { result: expected } });
  });

  it("filters arrays, presence, and all empty value shapes", async () => {
    const items = [
      { value: ["tag"] },
      { value: [] },
      { value: {} },
      { value: "" },
      { value: null },
      {},
    ];
    await expect(
      invokeNode(
        "list.filter",
        { items },
        {
          path: "items",
          field: "value",
          operator: "contains",
          value: "tag",
          outputPath: "result",
        },
      ),
    ).resolves.toMatchObject({ output: { result: [items[0]] } });
    await expect(
      invokeNode(
        "list.filter",
        { items },
        {
          path: "items",
          field: "value",
          operator: "exists",
          outputPath: "result",
        },
      ),
    ).resolves.toMatchObject({ output: { result: items.slice(0, 4) } });
    await expect(
      invokeNode(
        "list.filter",
        { items },
        {
          path: "items",
          field: "value",
          operator: "isEmpty",
          outputPath: "result",
        },
      ),
    ).resolves.toMatchObject({ output: { result: items.slice(1) } });
  });

  it("sorts and slices lists while handling missing values", async () => {
    const items = [
      { score: 2 },
      { score: null },
      { score: 10 },
      {},
      { score: 2 },
    ];
    const ascending = await invokeNode(
      "list.sort",
      { items },
      {
        path: "items",
        field: "score",
        direction: "ascending",
        outputPath: "result",
      },
    );
    expect(ascending).toMatchObject({
      output: {
        result: [
          { score: 2 },
          { score: 2 },
          { score: 10 },
          { score: null },
          {},
        ],
      },
    });
    const descending = await invokeNode(
      "list.sort",
      { items },
      {
        path: "items",
        field: "score",
        direction: "descending",
        outputPath: "result",
      },
    );
    expect(descending).toMatchObject({
      output: {
        result: [
          { score: 10 },
          { score: 2 },
          { score: 2 },
          { score: null },
          {},
        ],
      },
    });
    await expect(
      invokeNode(
        "list.slice",
        { items: [1, 2, 3, 4] },
        {
          path: "items",
          start: -4,
          limit: 2,
          outputPath: "result",
        },
      ),
    ).resolves.toMatchObject({ output: { result: [1, 2] } });
    await expect(
      invokeNode(
        "list.filter",
        { items: "not-a-list" },
        {
          path: "items",
          outputPath: "result",
        },
      ),
    ).rejects.toThrow("must be a list");
  });

  it("routes conditions and supports delay, terminal, and date nodes", async () => {
    await expect(
      invokeNode(
        "logic.condition",
        { amount: 5 },
        {
          path: "amount",
          operator: "greaterThan",
          value: 2,
        },
      ),
    ).resolves.toEqual({ output: { amount: 5 }, action: "true" });
    await expect(
      invokeNode(
        "logic.condition",
        { amount: 1 },
        {
          path: "amount",
          operator: "greaterThan",
          value: 2,
        },
      ),
    ).resolves.toEqual({ output: { amount: 1 }, action: "false" });
    await expect(
      invokeNode("logic.delay", { done: false }, { delayMs: -1 }),
    ).resolves.toEqual({ output: { done: false } });
    await expect(
      invokeNode("logic.stop", "primitive", { message: "Done {{input}}" }),
    ).resolves.toEqual({ output: { workflowResult: "Done primitive" } });

    for (const format of ["iso", "date", "timestamp"]) {
      const result = await invokeNode(
        "date.now",
        {},
        {
          format,
          outputPath: "now",
        },
      );
      expect(result).toMatchObject({ output: { now: expect.anything() } });
    }
  });
});
