import { beforeEach,describe,expect,it,vi } from "vitest";

import * as _dbModule from "@/server/infrastructure/db";

import {
countWorkspaces,
getWorkspaceBySlug,
getWorkspacesByUserId
} from "@/modules/workspace/use-cases";

// ─── Mocks ────────────────────────────────────────────────────────────

vi.mock("@/server/domain/services/audit", () => ({
  audit: { emit: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock("@/server/domain/services/authorization", () => ({
  authorization: {
    hasPermission: vi.fn().mockResolvedValue(true),
    invalidatePermissionCache: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("@/lib/logger", () => ({
  logHandledError: vi.fn(),
  logHandledWarning: vi.fn(),
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const CHAIN_KEYS = [
  "select",
  "insert",
  "update",
  "delete",
  "from",
  "where",
  "innerJoin",
  "leftJoin",
  "orderBy",
  "values",
  "set",
  "onConflictDoNothing",
] as const;

type ChainFn = ReturnType<typeof vi.fn>;

type ChainMock = {
  [K in (typeof CHAIN_KEYS)[number]]: ChainFn;
} & {
  limit: ChainFn;
  returning: ChainFn;
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
  _chain: ChainMock;
  _tx: ChainMock;
};

// vi.mock is hoisted — the factory must be self-contained (no external refs).
vi.mock("@/server/infrastructure/db", () => {
  const buildChain = (): ChainMock => {
    const c = {} as Record<string, ChainFn>;
    const keys = [
      "select",
      "insert",
      "update",
      "delete",
      "from",
      "where",
      "innerJoin",
      "leftJoin",
      "orderBy",
      "values",
      "set",
      "onConflictDoNothing",
    ] as const;
    for (const k of keys) {
      c[k] = vi.fn().mockReturnThis();
    }
    c.limit = vi.fn().mockResolvedValue([]);
    c.returning = vi.fn().mockResolvedValue([]);
    return c as ChainMock;
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
  return { db, _chain: chain, _tx: tx };
});
export const dbModule = _dbModule as unknown as DbModule;

function resetChain(chain: ChainMock) {
  for (const k of CHAIN_KEYS) {
    chain[k].mockReset().mockReturnThis();
  }
  chain.limit.mockReset().mockResolvedValue([]);
  chain.returning.mockReset().mockResolvedValue([]);
}

function reset() {
  resetChain(dbModule._chain);
  resetChain(dbModule._tx);
}

beforeEach(() => {
  vi.clearAllMocks();
  reset();
  dbModule.db.select.mockReturnValue(dbModule._chain);
  dbModule.db.insert.mockReturnValue(dbModule._chain);
  dbModule.db.update.mockReturnValue(dbModule._chain);
  dbModule.db.delete.mockReturnValue(dbModule._chain);
  dbModule.db.transaction.mockImplementation(
    (cb: (tx: ChainMock) => Promise<unknown>) => cb(dbModule._tx),
  );
});

// ─── Fixtures ────────────────────────────────────────────────────────

export const fakeWorkspace = {
  id: "ws-1",
  organizationId: "org-1",
  name: "My Workspace",
  slug: "my-ws",
  createdById: "user-1",
  createdAt: new Date(),
  updatedAt: new Date(),
  archivedAt: null,
};

export const fakeMember = {
  id: "member-1",
  workspaceId: "ws-1",
  userId: "user-2",
  status: "active",
  createdAt: new Date(),
  updatedAt: new Date(),
};

export const fakeRole = {
  id: "role-1",
  name: "workspace.member",
  scopeType: "workspace",
  isSystem: true,
  permissionsJson: [],
};

// ─── Tests ───────────────────────────────────────────────────────────

describe("getWorkspaceBySlug", () => {
  it("returns null when not found", async () => {
    const result = await getWorkspaceBySlug("nonexistent");
    expect(result).toBeNull();
  });

  it("returns workspace when found", async () => {
    dbModule._chain.limit.mockResolvedValueOnce([fakeWorkspace]);

    const result = await getWorkspaceBySlug("my-ws");
    expect(result).toEqual(fakeWorkspace);
  });
});

describe("countWorkspaces", () => {
  it("returns workspace count when .from() is terminal", async () => {
    // countWorkspaces: db.select({ value: count() }).from(workspaces)
    // .from() is terminal
    dbModule._chain.from.mockResolvedValueOnce([{ value: 7 }]);

    const result = await countWorkspaces();
    expect(result).toBe(7);
  });
});

describe("getWorkspacesByUserId", () => {
  it("returns list of workspaces with members and orgs", async () => {
    const row = {
      workspace: fakeWorkspace,
      member: fakeMember,
      organization: { id: "org-1", name: "Org" },
    };
    // getWorkspacesByUserId ends at .where() (innerJoin().where() terminal)
    dbModule._chain.where.mockResolvedValueOnce([row]);

    const result = await getWorkspacesByUserId("user-2");
    expect(result).toHaveLength(1);
    expect(result[0].workspace).toEqual(fakeWorkspace);
  });

  it("returns empty array when user has no workspaces", async () => {
    dbModule._chain.where.mockResolvedValueOnce([]);

    const result = await getWorkspacesByUserId("user-unknown");
    expect(result).toHaveLength(0);
  });
});
