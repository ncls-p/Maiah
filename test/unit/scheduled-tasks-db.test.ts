import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/crypto", () => ({
  encryptValue: vi.fn(async (value: string) => `enc:${value}`),
}));

vi.mock("@/lib/logger", () => ({
  logHandledError: vi.fn(),
  logHandledWarning: vi.fn(),
}));

vi.mock("@/modules/agent/use-cases", () => ({
  canUseAgent: vi.fn().mockReturnValue(true),
  getActiveVersion: vi.fn(),
  getAgentById: vi.fn(),
}));

vi.mock("@/modules/agent/runtime-executor", () => ({
  executeAgent: vi.fn().mockResolvedValue({
    runId: "run-1",
    text: "Generated answer",
    inputTokens: 12,
    outputTokens: 34,
    totalTreeTokens: 46,
    reused: false,
  }),
}));

vi.mock("@/modules/tool/builtin-tools", () => ({
  getBuiltInToolByName: vi.fn(),
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

import { encryptValue } from "@/lib/crypto";
import { logHandledError, logHandledWarning } from "@/lib/logger";
import { getActiveVersion, getAgentById } from "@/modules/agent/use-cases";
import { executeAgent } from "@/modules/agent/runtime-executor";
import { getBuiltInToolByName } from "@/modules/tool/builtin-tools";
import * as _dbModule from "@/server/infrastructure/db";
import {
  createScheduledTask,
  deleteScheduledTask,
  listScheduledTasks,
  processDueScheduledTasks,
  updateScheduledTask,
} from "@/modules/scheduled-tasks/use-cases";

const dbModule = _dbModule as unknown as DbModule;

function resetDb() {
  dbModule.db.select.mockReset().mockReturnValue(dbModule._c);
  dbModule.db.insert.mockReset().mockReturnValue(dbModule._c);
  dbModule.db.update.mockReset().mockReturnValue(dbModule._c);
  dbModule.db.delete.mockReset().mockReturnValue(dbModule._c);
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
  ] as const) {
    dbModule._c[key].mockReset().mockReturnThis();
  }
  dbModule._c.limit.mockReset().mockResolvedValue([]);
  dbModule._c.returning.mockReset().mockResolvedValue([]);
}

const agent = { id: "agent-1", createdById: "user-1", isGlobal: false };
const version = {
  id: "version-1",
  systemPrompt: "System",
  temperature: "0.4",
  topP: "0.8",
  maxOutputTokens: 8000,
  providerId: "provider-1",
  modelId: "model-1",
};

beforeEach(() => {
  vi.clearAllMocks();
  resetDb();
  vi.mocked(getAgentById).mockResolvedValue(agent as never);
  vi.mocked(getActiveVersion).mockResolvedValue(version as never);
  vi.mocked(executeAgent).mockResolvedValue({
    runId: "run-1",
    text: "Generated answer",
    inputTokens: 12,
    outputTokens: 34,
    totalTreeTokens: 46,
    reused: false,
  } as never);
  vi.mocked(getBuiltInToolByName).mockReturnValue({
    inputSchema: { parse: vi.fn((value) => value) },
    execute: vi
      .fn()
      .mockResolvedValue([{ title: "Source", url: "https://example.test" }]),
  } as never);
});

describe("scheduled task CRUD", () => {
  it("lists tasks ordered by next run", async () => {
    dbModule._c.orderBy.mockResolvedValueOnce([{ id: "task-1" }]);

    await expect(listScheduledTasks("ws-1", "user-1")).resolves.toEqual([
      { id: "task-1" },
    ]);
  });

  it("creates normalized tasks after checking agent access", async () => {
    dbModule._c.returning.mockResolvedValueOnce([
      { id: "task-1", title: "Daily" },
    ]);

    const task = await createScheduledTask({
      workspaceId: "ws-1",
      userId: "user-1",
      agentId: "agent-1",
      title: "  Daily  ",
      prompt: "  Summarize  ",
      frequency: "daily",
      timeOfDay: "08:00",
    });

    expect(task).toEqual({ id: "task-1", title: "Daily" });
    expect(getAgentById).toHaveBeenCalledWith("agent-1", "ws-1");
    expect(dbModule._c.values).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Daily",
        prompt: "Summarize",
        intervalMinutes: null,
      }),
    );
  });

  it("updates existing tasks and recomputes the schedule", async () => {
    dbModule._c.limit.mockResolvedValueOnce([
      {
        id: "task-1",
        agentId: "agent-1",
        conversationId: null,
        title: "Old",
        prompt: "Old prompt",
        frequency: "interval",
        timezone: "UTC",
        timeOfDay: null,
        intervalMinutes: 30,
        enabled: true,
      },
    ]);
    dbModule._c.returning.mockResolvedValueOnce([
      { id: "task-1", title: "New" },
    ]);

    const result = await updateScheduledTask("task-1", "ws-1", "user-1", {
      title: " New ",
      prompt: " Updated ",
      frequency: "interval",
      intervalMinutes: 15,
      enabled: false,
    });

    expect(result).toEqual({ id: "task-1", title: "New" });
    expect(dbModule._c.set).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "New",
        prompt: "Updated",
        intervalMinutes: 15,
        enabled: false,
      }),
    );
  });

  it("throws when updating an unknown task and deletes by scope", async () => {
    dbModule._c.limit.mockResolvedValueOnce([]);
    await expect(
      updateScheduledTask("missing", "ws-1", "user-1", {}),
    ).rejects.toThrow("Scheduled task not found");

    await deleteScheduledTask("task-1", "ws-1", "user-1");
    expect(dbModule.db.delete).toHaveBeenCalled();
  });
});

describe("processDueScheduledTasks", () => {
  it("runs due tasks, writes conversation messages, and records usage", async () => {
    const task = {
      id: "task-1",
      workspaceId: "ws-1",
      userId: "user-1",
      agentId: "agent-1",
      conversationId: "conv-1",
      title: "Daily research",
      prompt: "Find news",
      frequency: "interval",
      timezone: "UTC",
      timeOfDay: null,
      intervalMinutes: 30,
      nextRunAt: new Date("2025-01-01T00:00:00Z"),
    };
    dbModule._c.limit
      .mockResolvedValueOnce([task])
      .mockResolvedValueOnce([{ id: "conv-1" }]);
    dbModule._c.returning
      .mockResolvedValueOnce([{ id: "message-user" }])
      .mockResolvedValueOnce([{ id: "message-assistant" }]);

    const count = await processDueScheduledTasks(
      new Date("2025-01-01T00:00:00Z"),
    );

    expect(count).toBe(1);
    expect(executeAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining("Contexte web récupéré"),
        trigger: "scheduled",
        agentVersionId: "version-1",
        idempotencyKey: "task-1:2025-01-01T00:00:00.000Z",
      }),
    );
    expect(encryptValue).toHaveBeenCalledWith(
      expect.stringContaining("Tâche planifiée"),
    );
    expect(encryptValue).toHaveBeenCalledWith("Generated answer");
    expect(dbModule._c.set).toHaveBeenCalledWith(
      expect.objectContaining({ lastStatus: "success" }),
    );
  });

  it("creates a conversation when the existing one is missing", async () => {
    const task = {
      id: "task-2",
      workspaceId: "ws-1",
      userId: "user-1",
      agentId: "agent-1",
      conversationId: "missing-conv",
      title: "Daily research",
      prompt: "Find news",
      frequency: "interval",
      timezone: "UTC",
      timeOfDay: null,
      intervalMinutes: 30,
      nextRunAt: new Date("2025-01-01T00:00:00Z"),
    };
    dbModule._c.limit.mockResolvedValueOnce([task]).mockResolvedValueOnce([]);
    dbModule._c.returning
      .mockResolvedValueOnce([{ id: "conv-new" }])
      .mockResolvedValueOnce([{ id: "message-user" }])
      .mockResolvedValueOnce([{ id: "message-assistant" }]);

    await processDueScheduledTasks(new Date("2025-01-01T00:00:00Z"));

    expect(dbModule._c.values).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Daily research", status: "active" }),
    );
    expect(dbModule._c.set).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: "conv-new" }),
    );
  });

  it("marks due tasks failed when execution throws and logs search failures", async () => {
    const task = {
      id: "task-3",
      workspaceId: "ws-1",
      userId: "user-1",
      agentId: "agent-1",
      conversationId: "conv-1",
      title: "Broken",
      prompt: "Find news",
      frequency: "interval",
      timezone: "UTC",
      timeOfDay: null,
      intervalMinutes: 30,
      nextRunAt: new Date("2025-01-01T00:00:00Z"),
    };
    dbModule._c.limit
      .mockResolvedValueOnce([task])
      .mockResolvedValueOnce([{ id: "conv-1" }]);
    dbModule._c.returning.mockResolvedValueOnce([{ id: "message-user" }]);
    vi.mocked(getBuiltInToolByName).mockReturnValueOnce({
      inputSchema: {
        parse: vi.fn(() => {
          throw new Error("bad input");
        }),
      },
      execute: vi.fn(),
    } as never);
    vi.mocked(executeAgent).mockRejectedValueOnce(new Error("model down"));

    const count = await processDueScheduledTasks(
      new Date("2025-01-01T00:00:00Z"),
    );

    expect(count).toBe(1);
    expect(logHandledWarning).toHaveBeenCalledWith(
      "Scheduled task web search failed",
      expect.objectContaining({ error: "bad input" }),
    );
    expect(logHandledError).toHaveBeenCalledWith(
      "Scheduled task failed",
      expect.objectContaining({ taskId: "task-3", error: "model down" }),
    );
    expect(dbModule._c.set).toHaveBeenCalledWith(
      expect.objectContaining({
        lastStatus: "failed",
        lastError: "model down",
      }),
    );
  });
});
