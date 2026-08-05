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
import { database, definition, version, workflow, workflowMocks } from "./workflow-use-cases.test.database";


describe("workflow CRUD use cases", () => {
  it("lists active workflows and loads a parsed version", async () => {
    database.chain.orderBy.mockResolvedValueOnce([workflow]);
    await expect(listWorkflows("workspace-1")).resolves.toEqual([workflow]);

    database.chain.limit
      .mockResolvedValueOnce([workflow])
      .mockResolvedValueOnce([version]);
    await expect(
      getWorkflowDetail("workflow-1", "workspace-1"),
    ).resolves.toMatchObject({
      id: "workflow-1",
      version: 2,
      definition,
    });
  });

  it("rejects missing, archived, and versionless workflows", async () => {
    database.chain.limit.mockResolvedValueOnce([]);
    await expect(
      getWorkflowDetail("missing", "workspace-1"),
    ).rejects.toBeInstanceOf(WorkflowNotFoundError);

    database.chain.limit.mockResolvedValueOnce([
      { ...workflow, status: "archived" },
    ]);
    await expect(
      getWorkflowDetail("workflow-1", "workspace-1"),
    ).rejects.toBeInstanceOf(WorkflowNotFoundError);

    database.chain.limit
      .mockResolvedValueOnce([workflow])
      .mockResolvedValueOnce([]);
    await expect(
      getWorkflowDetail("workflow-1", "workspace-1"),
    ).rejects.toBeInstanceOf(WorkflowConflictError);
  });

  it("creates the workflow and its initial version transactionally", async () => {
    database.chain.returning.mockResolvedValueOnce([workflow]);
    await expect(
      createWorkflow({
        workspaceId: "workspace-1",
        userId: "user-1",
        name: "Automation",
      }),
    ).resolves.toMatchObject({ version: 1, definition });
    expect(database.db.transaction).toHaveBeenCalled();
    expect(database.chain.values).toHaveBeenCalledWith(
      expect.objectContaining({ description: null }),
    );

    database.chain.returning.mockResolvedValueOnce([]);
    await expect(
      createWorkflow({
        workspaceId: "workspace-1",
        userId: "user-1",
        name: "Missing",
        description: "Description",
      }),
    ).rejects.toThrow("Failed to create workflow");
  });

  it("updates definitions and metadata, including the existing definition fallback", async () => {
    const updated = { ...workflow, name: "Updated", latestVersion: 3 };
    database.chain.limit.mockResolvedValueOnce([workflow]);
    database.chain.returning.mockResolvedValueOnce([updated]);
    await expect(
      updateWorkflow({
        workflowId: workflow.id,
        workspaceId: workflow.workspaceId,
        userId: "user-1",
        name: "Updated",
        description: "New description",
        definition,
      }),
    ).resolves.toMatchObject({
      name: "Updated",
      version: 3,
      definition,
    });
    expect(database.db.update.mock.invocationCallOrder[0]).toBeLessThan(
      database.db.insert.mock.invocationCallOrder[0]!,
    );
    expect(database.chain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Updated",
        description: "New description",
        status: "draft",
        latestVersion: expect.anything(),
      }),
    );

    database.chain.limit
      .mockResolvedValueOnce([workflow])
      .mockResolvedValueOnce([{ definitionJson: version.definitionJson }]);
    database.chain.returning.mockResolvedValueOnce([workflow]);
    await expect(
      updateWorkflow({
        workflowId: workflow.id,
        workspaceId: workflow.workspaceId,
        userId: "user-1",
      }),
    ).resolves.toMatchObject({ version: 2, definition });

    database.chain.limit.mockResolvedValueOnce([workflow]);
    database.chain.returning.mockResolvedValueOnce([]);
    await expect(
      updateWorkflow({
        workflowId: workflow.id,
        workspaceId: workflow.workspaceId,
        userId: "user-1",
        name: "Gone",
      }),
    ).rejects.toBeInstanceOf(WorkflowNotFoundError);
  });

  it("publishes validated versions and archives scoped workflows", async () => {
    database.chain.limit
      .mockResolvedValueOnce([workflow])
      .mockResolvedValueOnce([version]);
    database.chain.returning.mockResolvedValueOnce([
      { ...workflow, status: "active", activeVersion: 2 },
    ]);
    await expect(
      publishWorkflow(workflow.id, workflow.workspaceId),
    ).resolves.toMatchObject({ status: "active", activeVersion: 2 });
    expect(workflowMocks.compile).toHaveBeenCalledWith(
      expect.objectContaining({ workflowId: workflow.id, version: 2 }),
    );

    database.chain.limit.mockResolvedValueOnce([workflow]);
    database.chain.returning.mockResolvedValueOnce([
      { ...workflow, status: "archived" },
    ]);
    await expect(
      archiveWorkflow(workflow.id, workflow.workspaceId),
    ).resolves.toMatchObject({ status: "archived" });
  });
});
