import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/infrastructure/ai-sdk/devtools", () => ({
  registerAiSdkDevTools: vi.fn(),
}));

vi.mock("@/server/domain/services/audit", () => ({
  audit: { emit: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/crypto", () => ({
  encryptValue: vi.fn().mockResolvedValue("encrypted-payload"),
  decryptValue: vi.fn().mockResolvedValue("decrypted-value"),
}));

vi.mock("@/modules/mcp/client", () => ({
  callRemoteMcpTool: vi.fn().mockResolvedValue({ id: "wf-1" }),
}));

vi.mock("@/modules/mcp/use-cases", () => ({
  getMcpServer: vi.fn().mockResolvedValue({
    id: "mcp-1",
    workspaceId: "ws-1",
    name: "n8n",
    transport: "sse",
    url: "https://example.test/sse",
    enabled: true,
  }),
}));

vi.mock("@/server/infrastructure/providers", () => ({
  getAdapter: vi.fn().mockReturnValue({
    createChatModel: vi.fn().mockReturnValue({ model: "runtime-model" }),
  }),
}));

vi.mock("ai", () => ({
  generateText: vi.fn().mockResolvedValue({ text: "Automation ready." }),
  stepCountIs: vi.fn((steps) => ({ type: "step-count", steps })),
  tool: vi.fn((definition) => definition),
}));

type Chain = {
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  from: ReturnType<typeof vi.fn>;
  where: ReturnType<typeof vi.fn>;
  orderBy: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  values: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  returning: ReturnType<typeof vi.fn>;
  onConflictDoUpdate: ReturnType<typeof vi.fn>;
};

function makeChain(): Chain {
  const c = {} as Chain;
  for (const key of [
    "select",
    "insert",
    "update",
    "delete",
    "from",
    "where",
    "orderBy",
    "values",
    "set",
    "onConflictDoUpdate",
  ] as const) {
    c[key] = vi.fn().mockReturnThis();
  }
  c.limit = vi.fn().mockResolvedValue([]);
  c.returning = vi.fn().mockResolvedValue([]);
  return c;
}

type DbModule = {
  db: {
    select: ReturnType<typeof vi.fn>;
    insert: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  _c: Chain;
};

vi.mock("@/server/infrastructure/db", () => {
  const chain = makeChain();
  return {
    db: {
      select: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    _c: chain,
  };
});

import { decryptValue } from "@/lib/crypto";
import { submitSecretRequest } from "@/modules/custom-tools/use-cases";
import { callRemoteMcpTool } from "@/modules/mcp/client";
import * as _dbModule from "@/server/infrastructure/db";
import { generateText } from "ai";

const dbModule = _dbModule as unknown as DbModule;

function resetDb() {
  for (const key of [
    "select",
    "insert",
    "update",
    "delete",
    "from",
    "where",
    "orderBy",
    "values",
    "set",
    "onConflictDoUpdate",
  ] as const) {
    dbModule._c[key].mockReset().mockReturnThis();
  }
  dbModule._c.limit.mockReset().mockResolvedValue([]);
  dbModule._c.returning.mockReset().mockResolvedValue([]);
  dbModule.db.select.mockReset().mockReturnValue(dbModule._c);
  dbModule.db.insert.mockReset().mockReturnValue(dbModule._c);
  dbModule.db.update.mockReset().mockReturnValue(dbModule._c);
  dbModule.db.delete.mockReset().mockReturnValue(dbModule._c);
}

beforeEach(() => {
  vi.clearAllMocks();
  resetDb();
  vi.mocked(generateText).mockResolvedValue({
    text: "Automation ready.",
  } as never);
  vi.mocked(callRemoteMcpTool).mockResolvedValue({
    content: [{ type: "text", text: JSON.stringify({ id: "wf-1" }) }],
  });
  vi.mocked(decryptValue).mockResolvedValue("decrypted-value");
});

describe("submitSecretRequest", () => {
  it("rejects missing, completed, and expired requests", async () => {
    dbModule._c.limit.mockResolvedValueOnce([]);
    await expect(
      submitSecretRequest({
        workspaceId: "ws-1",
        userId: "user-1",
        requestId: "req-1",
        values: {},
      }),
    ).rejects.toThrow("Secret request not found");

    resetDb();
    dbModule._c.limit.mockResolvedValueOnce([
      {
        status: "submitted",
        expiresAt: new Date(Date.now() + 1000),
        fieldsJson: [],
      },
    ]);
    await expect(
      submitSecretRequest({
        workspaceId: "ws-1",
        userId: "user-1",
        requestId: "req-1",
        values: {},
      }),
    ).rejects.toThrow("Secret request is no longer pending");

    resetDb();
    dbModule._c.limit.mockResolvedValueOnce([
      {
        status: "pending",
        expiresAt: new Date(Date.now() - 1000),
        fieldsJson: [],
      },
    ]);
    await expect(
      submitSecretRequest({
        workspaceId: "ws-1",
        userId: "user-1",
        requestId: "req-1",
        values: {},
      }),
    ).rejects.toThrow("Secret request expired");
  });

  it("validates required fields and stores encrypted sanitized values", async () => {
    dbModule._c.limit.mockResolvedValueOnce([
      {
        id: "req-1",
        title: "Discord",
        status: "pending",
        expiresAt: new Date(Date.now() + 1000),
        fieldsJson: [
          {
            name: "webhook_url",
            label: "Webhook URL",
            type: "url",
            required: true,
          },
        ],
      },
    ]);
    dbModule._c.returning.mockResolvedValueOnce([{ id: "cred-1" }]);

    const result = await submitSecretRequest({
      workspaceId: "ws-1",
      userId: "user-1",
      requestId: "req-1",
      values: { webhook_url: " https://discord.test/hook " },
    });

    expect(result.credentialRef).toBe("cred-1");
    expect(result.fields[0]).toMatchObject({
      name: "webhook_url",
      received: true,
    });
    expect(dbModule.db.update).toHaveBeenCalled();
  });

  it("rejects missing required values", async () => {
    dbModule._c.limit.mockResolvedValueOnce([
      {
        id: "req-1",
        title: "Token",
        status: "pending",
        expiresAt: new Date(Date.now() + 1000),
        fieldsJson: [
          { name: "token", label: "Token", type: "secret", required: true },
        ],
      },
    ]);

    await expect(
      submitSecretRequest({
        workspaceId: "ws-1",
        userId: "user-1",
        requestId: "req-1",
        values: {},
      }),
    ).rejects.toThrow("Missing value for Token");
  });
});
