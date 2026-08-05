import { beforeEach, describe, expect, it, vi } from "vitest";

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

export const dbModule = _dbModule as unknown as DbModule;

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
