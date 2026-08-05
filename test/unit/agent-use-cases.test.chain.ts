import { beforeEach,vi } from "vitest";

import * as _dbModule from "@/server/infrastructure/db";

// ─── Mocks ────────────────────────────────────────────────────────────

vi.mock("@/server/domain/services/audit", () => ({
  audit: { emit: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock("@/lib/logger", () => ({
  logHandledError: vi.fn(),
  logHandledWarning: vi.fn(),
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/crypto", () => ({
  decryptValue: vi.fn().mockResolvedValue("decrypted-secret"),
}));

vi.mock("@/modules/knowledge/use-cases", () => ({
  cloneKnowledgeBindings: vi.fn().mockResolvedValue(undefined),
  replaceKnowledgeBindingsForVersion: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/modules/skills/use-cases", () => ({
  cloneSkillBindings: vi.fn().mockResolvedValue(undefined),
  replaceSkillBindingsForVersion: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/modules/tool/use-cases", () => ({
  cloneToolBindings: vi.fn().mockResolvedValue(undefined),
  getToolBindingsForVersion: vi.fn().mockResolvedValue([]),
  insertToolBindingsForVersion: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/modules/agent/delegation-use-cases", () => ({
  cloneDelegationBindings: vi.fn().mockResolvedValue(undefined),
  insertDelegationBindingsForVersion: vi.fn().mockResolvedValue(undefined),
}));

const CHAIN_KEYS = [
  "select",
  "insert",
  "update",
  "delete",
  "from",
  "innerJoin",
  "where",
  "orderBy",
  "values",
  "set",
  "onConflictDoUpdate",
] as const;

type ChainFn = ReturnType<typeof vi.fn>;

export type Chain = {
  [K in (typeof CHAIN_KEYS)[number]]: ChainFn;
} & {
  limit: ChainFn;
  returning: ChainFn;
  then: ChainFn;
};

type DbMock = {
  select: ChainFn;
  insert: ChainFn;
  update: ChainFn;
  delete: ChainFn;
  transaction: ChainFn;
};

type DbModule = {
  db: DbMock;
  _c: Chain;
  _tx: Chain;
};

// vi.mock is hoisted — the factory must be self-contained (no external refs).
vi.mock("@/server/infrastructure/db", () => {
  const buildChain = (): Chain => {
    const c = {} as Record<string, ChainFn>;
    const keys = [
      "select",
      "insert",
      "update",
      "delete",
      "from",
      "innerJoin",
      "where",
      "orderBy",
      "values",
      "set",
      "onConflictDoUpdate",
    ] as const;
    for (const k of keys) {
      c[k] = vi.fn().mockReturnThis();
    }
    c.limit = vi.fn().mockResolvedValue([]);
    c.returning = vi.fn().mockResolvedValue([]);
    c.then = vi.fn((resolve) => Promise.resolve([]).then(resolve));
    return c as Chain;
  };

  const chain = buildChain();
  const tx = buildChain();
  const db: DbMock = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    transaction: vi.fn(),
  };
  return { db, _c: chain, _tx: tx };
});
export const dbModule = _dbModule as unknown as DbModule;

export function reset() {
  for (const chain of [dbModule._c, dbModule._tx]) {
    for (const k of CHAIN_KEYS) {
      chain[k].mockReset().mockReturnThis();
    }
    chain.limit.mockReset().mockResolvedValue([]);
    chain.returning.mockReset().mockResolvedValue([]);
    chain.then
      .mockReset()
      .mockImplementation((resolve) => Promise.resolve([]).then(resolve));
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  reset();
  dbModule.db.select.mockReturnValue(dbModule._c);
  dbModule.db.insert.mockReturnValue(dbModule._c);
  dbModule.db.update.mockReturnValue(dbModule._c);
  dbModule.db.delete.mockReturnValue(dbModule._c);
  dbModule.db.transaction.mockImplementation(
    (cb: (tx: Chain) => Promise<unknown>) => cb(dbModule._tx),
  );
});

// ─── Fixtures ────────────────────────────────────────────────────────

export const fakeAgent = {
  id: "agent-1",
  workspaceId: "ws-1",
  name: "My Agent",
  slug: "my-agent",
  description: null,
  createdById: "user-1",
  activeVersionId: "v1",
  visibility: "private",
  sourceType: "custom",
  kind: "assistant",
  sharingMode: "personal",
  shareTargetUserId: null,
  isGlobal: false,
  isRecommended: false,
  curationLabel: null,
  canAdminCurate: false,
  archivedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
} as const;

export const fakeVersion = {
  id: "v1",
  agentId: "agent-1",
  versionNumber: 1,
  name: "Initial version",
  systemPrompt: null,
  providerId: "prov-1",
  modelId: "model-1",
  temperature: null,
  topP: null,
  maxOutputTokens: 30000,
  maxToolCalls: 6,
  toolChoice: null,
  responseFormat: null,
  generationSettings: null,
  memoryPolicy: null,
  guardrails: null,
  approvalPolicy: null,
  createdById: "user-1",
  createdAt: new Date(),
  updatedAt: new Date(),
};
