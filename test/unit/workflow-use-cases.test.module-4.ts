import { beforeEach, describe, expect, it, vi } from "vitest";

import { createStarterDefinition } from "@/modules/workflows/contracts";
import type { WorkflowDefinition } from "@/modules/workflows/contracts";
import {
  WorkflowConflictError,
  WorkflowNotFoundError,
  WorkflowQueueError,
  archiveWorkflow,
  createWorkflow,
  createWorkflowRun,
  failQueuedWorkflowRun,
  getWorkflowDetail,
  getWorkflowRun,
  listQueuedWorkflowRunIds,
  listWorkflowRuns,
  listWorkflows,
  processWorkflowRun,
  publishWorkflow,
  updateWorkflow,
} from "@/modules/workflows/use-cases";
import { database, run, version, workflowMocks } from "./workflow-use-cases.test.database";


describe("workflow worker processing", () => {
  function record(status = "queued") {
    return {
      run: { ...run, status },
      version,
    };
  }

  it("rejects missing records and skips terminal runs", async () => {
    database.chain.limit.mockResolvedValueOnce([]);
    await expect(processWorkflowRun("missing")).rejects.toBeInstanceOf(
      WorkflowNotFoundError,
    );

    database.chain.limit.mockResolvedValueOnce([record("completed")]);
    await expect(processWorkflowRun(run.id)).resolves.toMatchObject({
      status: "completed",
    });
    expect(workflowMocks.compile).not.toHaveBeenCalled();

    database.chain.limit.mockResolvedValueOnce([record("cancelled")]);
    await expect(processWorkflowRun(run.id)).resolves.toMatchObject({
      status: "cancelled",
    });
  });

  it("persists every relevant node event and completes the run", async () => {
    database.chain.limit.mockResolvedValueOnce([record()]);
    database.chain.returning.mockResolvedValueOnce([
      { ...run, status: "completed", outputJson: { result: true } },
    ]);
    workflowMocks.createRuntime.mockImplementation(({ eventBus }) => ({
      run: vi.fn().mockImplementation(async () => {
        await eventBus.emit({
          type: "workflow:start",
          payload: {},
        });
        await eventBus.emit({
          type: "node:start",
          payload: { nodeId: "missing", input: null },
        });
        await eventBus.emit({
          type: "node:start",
          payload: { nodeId: "trigger", input: { name: "Ada" } },
        });
        await eventBus.emit({
          type: "node:retry",
          payload: { nodeId: "trigger", attempt: 1 },
        });
        await eventBus.emit({
          type: "node:finish",
          payload: { nodeId: "trigger", result: { output: { ok: true } } },
        });
        await eventBus.emit({
          type: "node:skipped",
          payload: { nodeId: "trigger" },
        });
        await eventBus.emit({
          type: "node:error",
          payload: { nodeId: "trigger", error: "failed" },
        });
        return { status: "completed", context: { result: true }, errors: [] };
      }),
    }));

    await expect(processWorkflowRun(run.id)).resolves.toMatchObject({
      status: "completed",
    });
    expect(database.db.insert).toHaveBeenCalled();
    expect(database.chain.onConflictDoUpdate).toHaveBeenCalled();
    expect(database.chain.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: "completed", error: null }),
    );
  });

  it("persists runtime failure results and thrown errors", async () => {
    database.chain.limit.mockResolvedValueOnce([record()]);
    database.chain.returning.mockResolvedValueOnce([
      { ...run, status: "failed", error: "node failed" },
    ]);
    workflowMocks.createRuntime.mockReturnValueOnce({
      run: vi.fn().mockResolvedValue({
        status: "failed",
        context: {},
        errors: [new Error("node failed")],
      }),
    });
    await expect(processWorkflowRun(run.id)).resolves.toMatchObject({
      status: "failed",
    });
    expect(database.chain.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed", error: "node failed" }),
    );

    database.chain.limit.mockResolvedValueOnce([record()]);
    workflowMocks.createRuntime.mockReturnValueOnce({
      run: vi.fn().mockRejectedValue(new Error("runtime exploded")),
    });
    await expect(processWorkflowRun(run.id)).rejects.toThrow(
      "runtime exploded",
    );
    expect(database.chain.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed", error: "runtime exploded" }),
    );
  });

  it("persists the underlying node error instead of only the runtime wrapper", async () => {
    database.chain.limit.mockResolvedValueOnce([record()]);
    database.chain.returning.mockResolvedValueOnce([
      { ...run, status: "failed" },
    ]);
    const sandboxError = new Error(
      "Sandbox execution failed (exit code 1): SyntaxError: Unexpected token",
    );
    const wrappedError = new Error("Node 'trigger' execution failed", {
      cause: sandboxError,
    });
    workflowMocks.createRuntime.mockImplementation(({ eventBus }) => ({
      run: vi.fn().mockImplementation(async () => {
        await eventBus.emit({
          type: "node:start",
          payload: { nodeId: "trigger", input: { body: "rss" } },
        });
        await eventBus.emit({
          type: "node:error",
          payload: { nodeId: "trigger", error: wrappedError },
        });
        return {
          status: "failed",
          context: {},
          errors: [wrappedError],
        };
      }),
    }));

    await expect(processWorkflowRun(run.id)).resolves.toMatchObject({
      status: "failed",
    });
    const storedErrors = database.chain.set.mock.calls
      .map(([value]) => (value as { error?: string }).error)
      .filter(Boolean);
    expect(storedErrors).toEqual(
      expect.arrayContaining([
        expect.stringContaining("SyntaxError: Unexpected token"),
      ]),
    );
    expect(storedErrors).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Node 'trigger' execution failed"),
      ]),
    );
  });

  it("persists compilation failures before the runtime starts", async () => {
    database.chain.limit.mockResolvedValueOnce([record()]);
    workflowMocks.compile.mockImplementationOnce(() => {
      throw new Error("invalid workflow graph");
    });

    await expect(processWorkflowRun(run.id)).rejects.toThrow(
      "invalid workflow graph",
    );
    expect(database.chain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        error: "invalid workflow graph",
      }),
    );
    expect(workflowMocks.createRuntime).not.toHaveBeenCalled();
  });

  it("fails only workflow runs that are still queued", async () => {
    database.chain.returning.mockResolvedValueOnce([
      { ...run, status: "failed", error: "queue mismatch" },
    ]);

    await expect(
      failQueuedWorkflowRun(run.id, "queue mismatch"),
    ).resolves.toMatchObject({
      status: "failed",
      error: "queue mismatch",
    });
    expect(database.chain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        error: "queue mismatch",
      }),
    );
    expect(database.chain.where).toHaveBeenCalled();
  });

  it("lists queued identifiers for worker recovery", async () => {
    database.chain.limit.mockResolvedValueOnce([
      { id: "run-1" },
      { id: "run-2" },
    ]);
    await expect(listQueuedWorkflowRunIds()).resolves.toEqual([
      "run-1",
      "run-2",
    ]);
  });
});
