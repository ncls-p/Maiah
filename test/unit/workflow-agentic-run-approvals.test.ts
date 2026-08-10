import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const chain = {
    from: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
    values: vi.fn(),
    returning: vi.fn(),
    set: vi.fn(),
  };
  for (const method of ["from", "where", "values", "set"] as const) {
    chain[method].mockReturnValue(chain);
  }
  return {
    chain,
    select: vi.fn(() => chain),
    insert: vi.fn(() => chain),
    update: vi.fn(() => chain),
    auditEmit: vi.fn(),
    createWorkflowRun: vi.fn(),
  };
});

vi.mock("@/server/infrastructure/db", () => ({
  db: {
    select: mocks.select,
    insert: mocks.insert,
    update: mocks.update,
  },
}));

vi.mock("@/lib/crypto", () => ({
  encryptValue: vi.fn(async (value: string) => `enc:${value}`),
  decryptValue: vi.fn(async (value: string) => value.replace(/^enc:/, "")),
}));

vi.mock("@/server/domain/services/audit", () => ({
  audit: { emit: mocks.auditEmit },
}));

vi.mock("@/modules/workflows/use-cases", () => ({
  createWorkflowRun: mocks.createWorkflowRun,
}));

import {
  approveWorkflowAgentRunRequest,
  createWorkflowAgentRunRequest,
  getPendingWorkflowAgentRunRequests,
  rejectWorkflowAgentRunRequest,
  WorkflowAgentRunDecisionError,
} from "@/modules/workflows/agentic-run-approvals";

const workflowId = "11111111-1111-4111-8111-111111111111";
const workspaceId = "22222222-2222-4222-8222-222222222222";
const userId = "33333333-3333-4333-8333-333333333333";
const requestId = "44444444-4444-4444-8444-444444444444";
const now = new Date("2026-07-23T10:00:00.000Z");

function requestRow(
  status:
    | "pending"
    | "approving"
    | "approved"
    | "rejected"
    | "expired"
    | "failed" = "pending",
) {
  return {
    id: requestId,
    workflowId,
    workspaceId,
    userId,
    title: "Run the tested workflow",
    reason: "Verify the generated summary",
    inputEncrypted: 'enc:{"apiKey":"private","message":"Hello"}',
    inputPreviewJson: {
      apiKey: "[REDACTED]",
      message: "Hello",
    },
    expectedVersion: 3,
    status,
    runId: status === "approved" ? "run-1" : null,
    error: null,
    expiresAt: new Date("2099-07-23T11:00:00.000Z"),
    createdAt: now,
    decidedAt: status === "pending" ? null : now,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const method of ["from", "where", "values", "set"] as const) {
    mocks.chain[method].mockReturnValue(mocks.chain);
  }
  mocks.chain.orderBy.mockResolvedValue([]);
  mocks.chain.limit.mockResolvedValue([]);
  mocks.chain.returning.mockResolvedValue([]);
  mocks.auditEmit.mockResolvedValue(undefined);
  mocks.createWorkflowRun.mockResolvedValue({ id: "run-1" });
});

describe("workflow agent run approvals", () => {
  it("encrypts raw run input and exposes only a redacted preview", async () => {
    mocks.chain.returning.mockResolvedValueOnce([requestRow()]);

    await expect(
      createWorkflowAgentRunRequest({
        workflowId,
        workspaceId,
        userId,
        title: "Run the tested workflow",
        reason: "Verify the generated summary",
        payload: { apiKey: "private", message: "Hello" },
        expectedVersion: 3,
      }),
    ).resolves.toMatchObject({
      id: requestId,
      inputPreview: {
        apiKey: "[REDACTED]",
        message: "Hello",
      },
      expectedVersion: 3,
      status: "pending",
    });

    expect(mocks.chain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        inputEncrypted: 'enc:{"apiKey":"private","message":"Hello"}',
        inputPreviewJson: {
          apiKey: "[REDACTED]",
          message: "Hello",
        },
        expectedVersion: 3,
      }),
    );
    expect(mocks.auditEmit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "workflow.agentRunRequested" }),
    );
  });

  it("returns only unexpired pending requests in the current scope", async () => {
    mocks.chain.orderBy.mockResolvedValueOnce([
      requestRow(),
      {
        ...requestRow(),
        id: "55555555-5555-4555-8555-555555555555",
        expiresAt: new Date("2020-01-01T00:00:00.000Z"),
      },
    ]);

    await expect(
      getPendingWorkflowAgentRunRequests({
        workflowId,
        workspaceId,
        userId,
      }),
    ).resolves.toEqual([expect.objectContaining({ id: requestId })]);
  });

  it("claims once and launches the exact tested version after approval", async () => {
    mocks.chain.limit.mockResolvedValueOnce([requestRow()]);
    mocks.chain.returning.mockResolvedValueOnce([
      { ...requestRow(), status: "approving" },
    ]);

    await expect(
      approveWorkflowAgentRunRequest({
        requestId,
        workflowId,
        workspaceId,
        userId,
      }),
    ).resolves.toEqual({
      requestId,
      status: "approved",
      runId: "run-1",
    });

    expect(mocks.createWorkflowRun).toHaveBeenCalledWith({
      workflowId,
      workspaceId,
      userId,
      payload: { apiKey: "private", message: "Hello" },
      versionNumber: 3,
      idempotencyKey: `workflow-agent-run:${requestId}`,
      trigger: "agent",
    });
    expect(mocks.auditEmit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "workflow.agentRunApproved" }),
    );
  });

  it("is idempotent after approval and never creates a second run", async () => {
    mocks.chain.limit.mockResolvedValueOnce([requestRow("approved")]);

    await expect(
      approveWorkflowAgentRunRequest({
        requestId,
        workflowId,
        workspaceId,
        userId,
      }),
    ).resolves.toEqual({
      requestId,
      status: "approved",
      runId: "run-1",
    });
    expect(mocks.createWorkflowRun).not.toHaveBeenCalled();
  });

  it("rejects with a compare-and-set decision and cannot execute afterward", async () => {
    mocks.chain.limit.mockResolvedValueOnce([requestRow()]);
    mocks.chain.returning.mockResolvedValueOnce([requestRow("rejected")]);

    await expect(
      rejectWorkflowAgentRunRequest({
        requestId,
        workflowId,
        workspaceId,
        userId,
      }),
    ).resolves.toEqual({ requestId, status: "rejected" });
    expect(mocks.createWorkflowRun).not.toHaveBeenCalled();
    expect(mocks.auditEmit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "workflow.agentRunRejected" }),
    );

    mocks.chain.limit.mockResolvedValueOnce([requestRow("rejected")]);
    await expect(
      approveWorkflowAgentRunRequest({
        requestId,
        workflowId,
        workspaceId,
        userId,
      }),
    ).rejects.toBeInstanceOf(WorkflowAgentRunDecisionError);
    expect(mocks.createWorkflowRun).not.toHaveBeenCalled();
  });
});
