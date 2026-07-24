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

import {
  appendWorkflowAgentMessage,
  consumeWorkflowAgentInputRequest,
  createWorkflowAgentInputRequest,
  getWorkflowAgentHistory,
  isWorkflowSecretReference,
  resolveWorkflowSecretReferences,
  submitWorkflowAgentInputRequest,
} from "@/modules/workflows/agentic-history";

const workflowId = "11111111-1111-4111-8111-111111111111";
const workspaceId = "22222222-2222-4222-8222-222222222222";
const userId = "33333333-3333-4333-8333-333333333333";
const requestId = "44444444-4444-4444-8444-444444444444";
const now = new Date("2026-07-23T10:00:00.000Z");

const fields = [
  {
    name: "api_key",
    label: "API key",
    type: "secret" as const,
    sensitive: false,
    required: true,
  },
  {
    name: "base_url",
    label: "Base URL",
    type: "url" as const,
    sensitive: false,
    required: true,
  },
];

function requestRow(status: "pending" | "submitted" | "consumed") {
  return {
    id: requestId,
    workflowId,
    workspaceId,
    userId,
    title: "Connection details",
    description: "Required to configure the HTTP step",
    fieldsJson: fields,
    status,
    valuesEncrypted:
      status === "pending"
        ? null
        : 'enc:{"api_key":"sk-private","base_url":"https://api.example.com"}',
    expiresAt: new Date("2099-07-23T11:00:00.000Z"),
    createdAt: now,
    submittedAt: status === "pending" ? null : now,
    consumedAt: status === "consumed" ? now : null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const method of ["from", "where", "values", "set"] as const) {
    mocks.chain[method].mockReturnValue(mocks.chain);
  }
  mocks.chain.orderBy.mockReturnValue(mocks.chain);
  mocks.chain.limit.mockResolvedValue([]);
  mocks.chain.returning.mockResolvedValue([]);
  mocks.auditEmit.mockResolvedValue(undefined);
  vi.useRealTimers();
});

describe("workflow agentic history and secure inputs", () => {
  it("encrypts messages and restores display and model history per workflow", async () => {
    mocks.chain.returning.mockResolvedValueOnce([
      {
        id: requestId,
        role: "user",
        createdAt: now,
      },
    ]);

    await expect(
      appendWorkflowAgentMessage({
        workflowId,
        workspaceId,
        userId,
        role: "user",
        content: "Information supplied",
        modelContent: "Secret reference supplied",
      }),
    ).resolves.toMatchObject({
      id: requestId,
      content: "Information supplied",
    });

    mocks.chain.limit.mockResolvedValueOnce([
      {
        id: requestId,
        role: "user",
        contentEncrypted: "enc:Information supplied",
        modelContentEncrypted: "enc:Secret reference supplied",
        createdAt: now,
      },
    ]);
    mocks.chain.orderBy
      .mockReturnValueOnce(mocks.chain)
      .mockResolvedValueOnce([requestRow("pending")]);

    await expect(
      getWorkflowAgentHistory({ workflowId, workspaceId, userId }),
    ).resolves.toEqual({
      messages: [
        {
          id: requestId,
          role: "user",
          content: "Information supplied",
          modelContent: "Secret reference supplied",
          createdAt: now.toISOString(),
        },
      ],
      pendingRequests: [
        expect.objectContaining({
          id: requestId,
          fields: [
            expect.objectContaining({ name: "api_key", sensitive: true }),
            expect.objectContaining({ name: "base_url", sensitive: false }),
          ],
        }),
      ],
    });
  });

  it("forces password-like fields to be sensitive when creating a request", async () => {
    mocks.chain.returning.mockResolvedValueOnce([requestRow("pending")]);

    const result = await createWorkflowAgentInputRequest({
      workflowId,
      workspaceId,
      userId,
      title: "Connection details",
      fields,
    });

    expect(result.fields[0]).toMatchObject({
      name: "api_key",
      sensitive: true,
    });
    expect(mocks.chain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        fieldsJson: [
          expect.objectContaining({ name: "api_key", sensitive: true }),
          expect.objectContaining({ name: "base_url", sensitive: false }),
        ],
      }),
    );
    expect(mocks.auditEmit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "workflow.agentInputRequested" }),
    );
  });

  it("validates, encrypts, and consumes submitted values without exposing secrets", async () => {
    mocks.chain.limit.mockResolvedValueOnce([requestRow("pending")]);
    mocks.chain.where
      .mockReturnValueOnce(mocks.chain)
      .mockResolvedValueOnce([]);

    await expect(
      submitWorkflowAgentInputRequest({
        requestId,
        workflowId,
        workspaceId,
        userId,
        values: {
          api_key: "sk-private",
          base_url: "https://api.example.com",
        },
      }),
    ).resolves.toMatchObject({
      displayMessage: expect.stringContaining("en sécurité"),
    });

    mocks.chain.limit.mockResolvedValueOnce([requestRow("submitted")]);
    mocks.chain.where
      .mockReturnValueOnce(mocks.chain)
      .mockResolvedValueOnce([]);
    const consumed = await consumeWorkflowAgentInputRequest({
      requestId,
      workflowId,
      workspaceId,
      userId,
    });

    expect(consumed.displayContent).not.toContain("sk-private");
    expect(consumed.modelContent).not.toContain("sk-private");
    expect(consumed.modelContent).toContain(
      `__WORKFLOW_SECRET:${requestId}:api_key__`,
    );
    expect(consumed.modelContent).toContain("https://api.example.com");
    expect(mocks.auditEmit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "workflow.agentInputSubmitted" }),
    );
  });

  it("resolves opaque references only for sensitive fields at execution time", async () => {
    const reference = `__WORKFLOW_SECRET:${requestId}:api_key__`;
    expect(isWorkflowSecretReference(reference)).toBe(true);
    expect(isWorkflowSecretReference("sk-private")).toBe(false);
    mocks.chain.where.mockResolvedValueOnce([requestRow("consumed")]);

    await expect(
      resolveWorkflowSecretReferences(
        {
          url: "https://api.example.com",
          headers: { Authorization: `Bearer ${reference}` },
        },
        { workflowId, workspaceId },
      ),
    ).resolves.toEqual({
      url: "https://api.example.com",
      headers: { Authorization: "Bearer sk-private" },
    });
  });
});
