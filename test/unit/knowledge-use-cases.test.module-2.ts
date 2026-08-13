import { describe, expect, it } from "vitest";

import {
  archiveDocument,
  archiveKnowledgeBase,
  ingestTextDocument,
  listDocuments,
  scoreContent,
  updateKnowledgeBase,
} from "@/modules/knowledge/use-cases";
import {
  dbModule,
  fakeDoc,
  fakeKb,
} from "./knowledge-use-cases.test.db-module";

// ─── updateKnowledgeBase ──────────────────────────────────────────────

describe("updateKnowledgeBase", () => {
  it("throws when knowledge base not found", async () => {
    await expect(
      updateKnowledgeBase({
        knowledgeBaseId: "nonexistent",
        workspaceId: "ws-1",
        userId: "user-1",
      }),
    ).rejects.toThrow("Knowledge base not found");
  });

  it("updates and returns knowledge base", async () => {
    dbModule._c.limit.mockResolvedValueOnce([fakeKb]);
    dbModule._c.returning.mockResolvedValueOnce([
      { ...fakeKb, name: "Updated" },
    ]);

    const result = await updateKnowledgeBase({
      knowledgeBaseId: "kb-1",
      workspaceId: "ws-1",
      userId: "user-1",
      name: "Updated",
    });

    expect(result).toEqual({ ...fakeKb, name: "Updated" });
  });
});

// ─── archiveKnowledgeBase ─────────────────────────────────────────────

describe("archiveKnowledgeBase", () => {
  it("throws when knowledge base not found", async () => {
    await expect(
      archiveKnowledgeBase("nonexistent", "ws-1", "user-1"),
    ).rejects.toThrow("Knowledge base not found");
  });

  it("archives knowledge base", async () => {
    dbModule._c.limit.mockResolvedValueOnce([fakeKb]);

    await archiveKnowledgeBase("kb-1", "ws-1", "user-1");

    expect(dbModule.db.update).toHaveBeenCalled();
  });
});

// ─── ingestTextDocument ───────────────────────────────────────────────

describe("ingestTextDocument", () => {
  it("throws when knowledge base not found", async () => {
    await expect(
      ingestTextDocument({
        workspaceId: "ws-1",
        knowledgeBaseId: "nonexistent",
        userId: "user-1",
        title: "Test",
        content: "Content",
      }),
    ).rejects.toThrow("Knowledge base not found");
  });

  it("ingests document with non-empty content", async () => {
    // Q1: getKnowledgeBase → limit
    dbModule._c.limit.mockResolvedValueOnce([fakeKb]);

    // tx: insert document → returning
    const processingDoc = { ...fakeDoc };
    dbModule._tx.returning.mockResolvedValueOnce([processingDoc]);

    // processDocumentIngestion: select document (limit), select chunks (where), update (where)
    dbModule._c.limit.mockResolvedValueOnce([processingDoc]); // Q2: select document in processDocumentIngestion
    dbModule._c.where
      .mockReturnValueOnce(dbModule._c) // Q1 (getKb where) → chain to limit (already consumed)
      .mockResolvedValueOnce([{ id: "chunk-1" }]); // Q3: select chunks

    const result = await ingestTextDocument({
      workspaceId: "ws-1",
      knowledgeBaseId: "kb-1",
      userId: "user-1",
      title: "Test",
      content: "Hello world",
    });

    expect(result).toEqual(processingDoc);
    expect(dbModule.db.transaction).toHaveBeenCalledOnce();
  });

  it("marks document as failed when content is empty", async () => {
    dbModule._c.limit.mockResolvedValueOnce([fakeKb]);
    const failedDoc = { ...fakeDoc, status: "failed" };
    dbModule._tx.returning
      .mockResolvedValueOnce([fakeDoc]) // insert document
      .mockResolvedValueOnce([failedDoc]); // update to failed status

    const result = await ingestTextDocument({
      workspaceId: "ws-1",
      knowledgeBaseId: "kb-1",
      userId: "user-1",
      title: "Empty",
      content: "",
    });

    expect(result.status).toBe("failed");
  });
});

// ─── listDocuments ────────────────────────────────────────────────────

describe("listDocuments", () => {
  it("throws when knowledge base not found", async () => {
    await expect(listDocuments("nonexistent", "ws-1")).rejects.toThrow(
      "Knowledge base not found",
    );
  });

  it("returns documents ordered by createdAt", async () => {
    dbModule._c.limit.mockResolvedValueOnce([fakeKb]);
    dbModule._c.orderBy.mockResolvedValueOnce([
      { document: fakeDoc, chunkCount: 2, embeddingCount: 1 },
    ]);

    const result = await listDocuments("kb-1", "ws-1");
    expect(result).toHaveLength(1);
    expect(result[0]?.processingProgress).toBe(58);
  });
});

// ─── listDocuments (paged) ────────────────────────────────────────────

function thenableChain(result: unknown[]) {
  const chain = {} as Record<string, unknown>;
  const promise = Promise.resolve(result);
  for (const key of [
    "from",
    "where",
    "orderBy",
    "limit",
    "offset",
    "innerJoin",
    "leftJoin",
    "groupBy",
  ]) {
    chain[key] = () => chain;
  }
  chain.then = promise.then.bind(promise);
  return chain;
}

describe("listDocuments with pagination options", () => {
  it("returns a filtered page with total and status counts", async () => {
    // Query order: knowledge base, page rows, filtered total, status counts,
    // chunk/embedding progress for the page.
    const queue: unknown[][] = [
      [fakeKb],
      [fakeDoc],
      [{ total: 25 }],
      [{ ready: 20, processing: 3, failed: 2 }],
      [{ documentId: "doc-1", chunkCount: 2, embeddingCount: 1 }],
    ];
    dbModule.db.select.mockImplementation(() =>
      thenableChain(queue.shift() ?? []),
    );

    const result = await listDocuments("kb-1", "ws-1", undefined, {
      limit: 12,
      offset: 12,
      status: "processing",
      search: "test",
    });

    expect(result.total).toBe(25);
    expect(result.counts).toEqual({ ready: 20, processing: 3, failed: 2 });
    expect(result.documents).toHaveLength(1);
    expect(result.documents[0]?.processingProgress).toBe(58);
  });

  it("skips the progress query when the page is empty", async () => {
    const queue: unknown[][] = [
      [fakeKb],
      [],
      [{ total: 0 }],
      [{ ready: 0, processing: 0, failed: 0 }],
    ];
    dbModule.db.select.mockImplementation(() =>
      thenableChain(queue.shift() ?? []),
    );

    const result = await listDocuments("kb-1", "ws-1", undefined, {
      limit: 12,
      offset: 0,
    });

    expect(result).toEqual({
      documents: [],
      total: 0,
      counts: { ready: 0, processing: 0, failed: 0 },
    });
    expect(dbModule.db.select).toHaveBeenCalledTimes(4);
  });
});

// ─── archiveDocument ──────────────────────────────────────────────────

describe("archiveDocument", () => {
  it("throws when knowledge base not found", async () => {
    await expect(
      archiveDocument({
        documentId: "doc-1",
        knowledgeBaseId: "nonexistent",
        workspaceId: "ws-1",
        userId: "user-1",
      }),
    ).rejects.toThrow("Knowledge base not found");
  });

  it("throws when document not found", async () => {
    dbModule._c.limit.mockResolvedValueOnce([fakeKb]).mockResolvedValueOnce([]); // document not found

    await expect(
      archiveDocument({
        documentId: "doc-1",
        knowledgeBaseId: "kb-1",
        workspaceId: "ws-1",
        userId: "user-1",
      }),
    ).rejects.toThrow("Document not found");
  });

  it("deletes document when found", async () => {
    dbModule._c.limit
      .mockResolvedValueOnce([fakeKb])
      .mockResolvedValueOnce([fakeDoc]);

    await archiveDocument({
      documentId: "doc-1",
      knowledgeBaseId: "kb-1",
      workspaceId: "ws-1",
      userId: "user-1",
    });

    expect(dbModule.db.delete).toHaveBeenCalled();
  });
});

// ─── scoreContent ─────────────────────────────────────────────────────

describe("scoreContent", () => {
  it("returns 0 for no matching terms", () => {
    expect(scoreContent("hello world", "foo bar")).toBe(0);
  });

  it("returns 1 for single matching term", () => {
    expect(scoreContent("hello world", "hello")).toBe(1);
  });

  it("returns 2 for two matching terms", () => {
    expect(scoreContent("hello world", "hello world")).toBe(2);
  });

  it("is case insensitive", () => {
    expect(scoreContent("Hello World", "hello world")).toBe(2);
  });
});
