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
import { database, run, version, workflow, workflowMocks } from "./workflow-use-cases.test.database";


describe("workflow run use cases", () => {
  it("requires a published version for API runs", async () => {
    database.chain.limit.mockResolvedValueOnce([
      { ...workflow, activeVersion: null },
    ]);
    await expect(
      createWorkflowRun({
        workflowId: workflow.id,
        workspaceId: workflow.workspaceId,
        userId: "user-1",
      }),
    ).rejects.toBeInstanceOf(WorkflowConflictError);
  });

  it("returns an idempotent run without enqueueing again", async () => {
    database.chain.limit
      .mockResolvedValueOnce([workflow])
      .mockResolvedValueOnce([run]);
    await expect(
      createWorkflowRun({
        workflowId: workflow.id,
        workspaceId: workflow.workspaceId,
        userId: "user-1",
        idempotencyKey: "same-request",
      }),
    ).resolves.toBe(run);
    expect(workflowMocks.enqueue).not.toHaveBeenCalled();
  });

  it("recovers a concurrent idempotent run insert without enqueueing twice", async () => {
    const concurrentRun = { ...run, idempotencyKey: "same-request" };
    database.chain.limit
      .mockResolvedValueOnce([workflow])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([version])
      .mockResolvedValueOnce([concurrentRun]);
    database.chain.returning.mockResolvedValueOnce([]);

    await expect(
      createWorkflowRun({
        workflowId: workflow.id,
        workspaceId: workflow.workspaceId,
        userId: "user-1",
        idempotencyKey: "same-request",
      }),
    ).resolves.toBe(concurrentRun);
    expect(workflowMocks.enqueue).not.toHaveBeenCalled();
  });

  it("creates and enqueues published and draft runs", async () => {
    database.chain.limit
      .mockResolvedValueOnce([workflow])
      .mockResolvedValueOnce([version]);
    database.chain.returning.mockResolvedValueOnce([run]);
    await expect(
      createWorkflowRun({
        workflowId: workflow.id,
        workspaceId: workflow.workspaceId,
        userId: "user-1",
        payload: { name: "Ada" },
        useLatestDraft: true,
      }),
    ).resolves.toBe(run);
    expect(workflowMocks.enqueue).toHaveBeenCalledWith(run.id);
    expect(database.chain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        inputJson: { name: "Ada" },
        idempotencyKey: null,
      }),
    );
  });

  it("pins agent-approved runs to the exact tested version", async () => {
    const testedVersion = { ...version, version: 3, id: "version-3" };
    const agentRun = {
      ...run,
      workflowVersionId: testedVersion.id,
      trigger: "agent",
    };
    database.chain.limit
      .mockResolvedValueOnce([workflow])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([testedVersion]);
    database.chain.returning.mockResolvedValueOnce([agentRun]);

    await expect(
      createWorkflowRun({
        workflowId: workflow.id,
        workspaceId: workflow.workspaceId,
        userId: "user-1",
        payload: { message: "Test" },
        versionNumber: 3,
        trigger: "agent",
        idempotencyKey: "workflow-agent-run:request-1",
      }),
    ).resolves.toBe(agentRun);
    expect(database.chain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowVersionId: testedVersion.id,
        trigger: "agent",
        idempotencyKey: "workflow-agent-run:request-1",
      }),
    );
  });

  it("handles missing versions, failed inserts, and queue outages", async () => {
    database.chain.limit
      .mockResolvedValueOnce([workflow])
      .mockResolvedValueOnce([]);
    await expect(
      createWorkflowRun({
        workflowId: workflow.id,
        workspaceId: workflow.workspaceId,
        userId: "user-1",
      }),
    ).rejects.toBeInstanceOf(WorkflowConflictError);

    database.chain.limit
      .mockResolvedValueOnce([workflow])
      .mockResolvedValueOnce([version]);
    database.chain.returning.mockResolvedValueOnce([]);
    await expect(
      createWorkflowRun({
        workflowId: workflow.id,
        workspaceId: workflow.workspaceId,
        userId: "user-1",
      }),
    ).rejects.toThrow("Failed to create workflow run");

    database.chain.limit
      .mockResolvedValueOnce([workflow])
      .mockResolvedValueOnce([version]);
    database.chain.returning.mockResolvedValueOnce([run]);
    workflowMocks.enqueue.mockRejectedValueOnce(
      new Error("queue unavailable".repeat(1_000)),
    );
    await expect(
      createWorkflowRun({
        workflowId: workflow.id,
        workspaceId: workflow.workspaceId,
        userId: "user-1",
      }),
    ).rejects.toBeInstanceOf(WorkflowQueueError);
    expect(database.chain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        error: expect.stringMatching(/^queue unavailable/),
      }),
    );
  });

  it("lists runs and returns their ordered steps", async () => {
    database.chain.limit
      .mockResolvedValueOnce([workflow])
      .mockResolvedValueOnce([run]);
    await expect(
      listWorkflowRuns(workflow.id, workflow.workspaceId),
    ).resolves.toEqual([run]);

    const steps = [{ nodeId: "trigger", status: "completed" }];
    database.chain.limit.mockResolvedValueOnce([run]);
    database.chain.orderBy.mockResolvedValueOnce(steps);
    await expect(getWorkflowRun(run.id, workflow.workspaceId)).resolves.toEqual(
      {
        ...run,
        steps,
      },
    );

    database.chain.limit.mockResolvedValueOnce([]);
    await expect(
      getWorkflowRun("missing", workflow.workspaceId),
    ).rejects.toBeInstanceOf(WorkflowNotFoundError);
  });
});
