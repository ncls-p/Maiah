import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createKnowledgeBase,
  getKnowledgeBase,
  listKnowledgeBases,
} from "@/modules/knowledge/use-cases";
import { authorization } from "@/server/domain/services/authorization";
import * as _dbModule from "@/server/infrastructure/db";

// ─── Mocks ────────────────────────────────────────────────────────────

vi.mock("@/server/domain/services/audit", () => ({
  audit: { emit: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock("@/lib/crypto", () => ({
  encryptValue: vi.fn().mockResolvedValue("enc:chunk"),
  decryptValue: vi.fn().mockResolvedValue("decrypted content"),
}));

vi.mock("@/modules/knowledge/queue", () => ({
  enqueueDocumentIngestion: vi.fn().mockResolvedValue({ queued: true }),
  recoverDocumentIngestionJob: vi.fn().mockResolvedValue("enqueued"),
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
  innerJoin: ReturnType<typeof vi.fn>;
  leftJoin: ReturnType<typeof vi.fn>;
  groupBy: ReturnType<typeof vi.fn>;
  values: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  returning: ReturnType<typeof vi.fn>;
};

function makeChain(): Chain {
  const c = {} as Chain;
  for (const k of [
    "select",
    "insert",
    "update",
    "delete",
    "from",
    "where",
    "orderBy",
    "innerJoin",
    "leftJoin",
    "groupBy",
    "values",
    "set",
  ] as const) {
    c[k] = vi.fn().mockReturnThis();
  }
  c.limit = vi.fn().mockResolvedValue([]);
  c.returning = vi.fn().mockResolvedValue([]);
  return c;
}

type DbMock = {
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  transaction: ReturnType<typeof vi.fn>;
};

type DbModule = {
  db: DbMock;
  _c: Chain;
  _tx: Chain;
};

vi.mock("@/server/infrastructure/db", () => {
  const chain = makeChain();
  const tx = makeChain();
  return {
    db: {
      select: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      transaction: vi.fn(),
    },
    _c: chain,
    _tx: tx,
  };
});
export const dbModule = _dbModule as unknown as DbModule;

function reset() {
  for (const chain of [dbModule._c, dbModule._tx]) {
    for (const k of [
      "select",
      "insert",
      "update",
      "delete",
      "from",
      "where",
      "orderBy",
      "innerJoin",
      "leftJoin",
      "groupBy",
      "values",
      "set",
    ] as const) {
      chain[k].mockReset().mockReturnThis();
    }
    chain.limit.mockReset().mockResolvedValue([]);
    chain.returning.mockReset().mockResolvedValue([]);
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

export const fakeKb = {
  id: "kb-1",
  workspaceId: "ws-1",
  name: "My KB",
  description: null,
  createdById: "user-1",
  archivedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

export const fakeDoc = {
  id: "doc-1",
  workspaceId: "ws-1",
  knowledgeBaseId: "kb-1",
  title: "Test Doc",
  status: "processing",
  processingProgress: 20,
  processingStage: "chunked",
  errorMessage: null,
  sourceType: "text",
  mimeType: "text/plain",
  createdById: "user-1",
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ─── createKnowledgeBase ──────────────────────────────────────────────

describe("createKnowledgeBase", () => {
  it("inserts a knowledge base and returns it", async () => {
    dbModule._c.returning.mockResolvedValueOnce([fakeKb]);

    const result = await createKnowledgeBase({
      workspaceId: "ws-1",
      userId: "user-1",
      name: "My KB",
    });

    expect(dbModule.db.insert).toHaveBeenCalled();
    expect(result).toEqual(fakeKb);
  });
});

// ─── listKnowledgeBases ───────────────────────────────────────────────

describe("listKnowledgeBases", () => {
  it("returns knowledge bases ordered by createdAt desc", async () => {
    dbModule._c.orderBy.mockResolvedValueOnce([fakeKb]);

    const result = await listKnowledgeBases("ws-1");
    expect(result).toHaveLength(1);
  });

  it("returns empty array when no knowledge bases", async () => {
    dbModule._c.orderBy.mockResolvedValueOnce([]);

    const result = await listKnowledgeBases("ws-1");
    expect(result).toHaveLength(0);
  });

  it("hides another member's private data source without a direct share", async () => {
    dbModule._c.orderBy.mockResolvedValueOnce([{ ...fakeKb, isGlobal: false }]);
    const directPermission = vi
      .spyOn(authorization, "hasDirectPermission")
      .mockResolvedValueOnce(false);

    const result = await listKnowledgeBases("ws-1", "user-2");

    expect(result).toEqual([]);
    expect(directPermission).toHaveBeenCalledWith(
      { principalType: "user", principalId: "user-2" },
      "knowledgeBases.viewAllowed",
      "knowledge_base",
      "kb-1",
    );
  });

  it("shows a private data source to a directly shared recipient", async () => {
    dbModule._c.orderBy.mockResolvedValueOnce([{ ...fakeKb, isGlobal: false }]);
    vi.spyOn(authorization, "hasDirectPermission")
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    const result = await listKnowledgeBases("ws-1", "user-2");

    expect(result).toHaveLength(1);
    expect(result[0]?.canEdit).toBe(false);
  });
});

// ─── getKnowledgeBase ─────────────────────────────────────────────────

describe("getKnowledgeBase", () => {
  it("returns null when not found", async () => {
    const result = await getKnowledgeBase("nonexistent", "ws-1");
    expect(result).toBeNull();
  });

  it("returns knowledge base when found", async () => {
    dbModule._c.limit.mockResolvedValueOnce([fakeKb]);
    const result = await getKnowledgeBase("kb-1", "ws-1");
    expect(result).toEqual(fakeKb);
  });
});
