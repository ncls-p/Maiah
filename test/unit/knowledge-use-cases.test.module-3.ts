import { describe, expect, it, vi } from "vitest";

import {
  cloneKnowledgeBindings,
  getKnowledgeBindingsForVersion,
  listProcessingDocuments,
  processDocumentIngestion,
  replaceKnowledgeBindingsForVersion,
  searchBoundKnowledgeBases,
  searchKnowledgeBase,
} from "@/modules/knowledge/use-cases";
import { authorization } from "@/server/domain/services/authorization";
import {
  dbModule,
  fakeDoc,
  fakeKb,
} from "./knowledge-use-cases.test.db-module";

// ─── searchKnowledgeBase ──────────────────────────────────────────────

describe("searchKnowledgeBase", () => {
  it("throws when knowledge base not found", async () => {
    await expect(
      searchKnowledgeBase({
        workspaceId: "ws-1",
        knowledgeBaseId: "nonexistent",
        query: "test",
      }),
    ).rejects.toThrow("Knowledge base not found");
  });

  it("falls back to keyword search when no embeddings", async () => {
    // Q1: getKnowledgeBase → limit
    dbModule._c.limit.mockResolvedValueOnce([fakeKb]);

    // searchKnowledgeBaseByKeyword: innerJoin.where() → where terminal
    dbModule._c.where
      .mockReturnValueOnce(dbModule._c) // getKb .where → chains to limit
      .mockResolvedValueOnce([]); // keyword search rows (where terminal)

    const result = await searchKnowledgeBase({
      workspaceId: "ws-1",
      knowledgeBaseId: "kb-1",
      query: "hello",
    });

    expect(result).toEqual([]);
  });

  it("returns keyword search results", async () => {
    dbModule._c.limit.mockResolvedValueOnce([fakeKb]);

    const { decryptValue } = await import("@/lib/crypto");
    vi.mocked(decryptValue).mockResolvedValue("hello world content");

    const row = {
      chunk: { id: "chunk-1", chunkIndex: 0, contentEncrypted: "enc:content" },
      document: { id: "doc-1", title: "Doc 1" },
    };

    dbModule._c.where
      .mockReturnValueOnce(dbModule._c) // getKb where → chains to limit
      .mockResolvedValueOnce([row]); // keyword search results

    const result = await searchKnowledgeBase({
      workspaceId: "ws-1",
      knowledgeBaseId: "kb-1",
      query: "hello",
    });

    expect(result).toHaveLength(1);
    expect(result[0].documentTitle).toBe("Doc 1");
  });
});

// ─── getKnowledgeBindingsForVersion ───────────────────────────────────

describe("getKnowledgeBindingsForVersion", () => {
  it("returns bindings for a version (where terminal)", async () => {
    const binding = { id: "b1", knowledgeBaseId: "kb-1", name: "My KB" };
    dbModule._c.where.mockResolvedValueOnce([binding]);

    const result = await getKnowledgeBindingsForVersion("v1");
    expect(result).toHaveLength(1);
    expect(result[0].knowledgeBaseId).toBe("kb-1");
  });

  it("returns empty when no bindings", async () => {
    dbModule._c.where.mockResolvedValueOnce([]);

    const result = await getKnowledgeBindingsForVersion("v1");
    expect(result).toHaveLength(0);
  });

  it("checks a recipient grant against the data source id, not the binding id", async () => {
    dbModule._c.where.mockResolvedValueOnce([
      {
        id: "binding-1",
        knowledgeBaseId: "kb-1",
        name: "Shared KB",
        description: null,
        createdById: "owner-1",
        isGlobal: false,
      },
    ]);
    const directPermission = vi
      .spyOn(authorization, "hasDirectPermission")
      .mockResolvedValueOnce(true);

    await expect(
      getKnowledgeBindingsForVersion("v1", {
        workspaceId: "ws-1",
        userId: "recipient-1",
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        id: "binding-1",
        knowledgeBaseId: "kb-1",
      }),
    ]);
    expect(directPermission).toHaveBeenCalledWith(
      { principalType: "user", principalId: "recipient-1" },
      "knowledgeBases.viewAllowed",
      "knowledge_base",
      "kb-1",
    );
  });
});

// ─── replaceKnowledgeBindingsForVersion ───────────────────────────────

describe("replaceKnowledgeBindingsForVersion", () => {
  it("deletes existing bindings and inserts new ones", async () => {
    await replaceKnowledgeBindingsForVersion("v1", ["kb-1", "kb-2"]);

    expect(dbModule.db.delete).toHaveBeenCalled();
    expect(dbModule.db.insert).toHaveBeenCalled();
  });

  it("only deletes when empty array provided", async () => {
    await replaceKnowledgeBindingsForVersion("v1", []);

    expect(dbModule.db.delete).toHaveBeenCalled();
    expect(dbModule.db.insert).not.toHaveBeenCalled();
  });
});

// ─── cloneKnowledgeBindings ───────────────────────────────────────────

describe("cloneKnowledgeBindings", () => {
  it("is a no-op when fromAgentVersionId is null", async () => {
    await cloneKnowledgeBindings(null, "v2");

    expect(dbModule.db.select).not.toHaveBeenCalled();
  });

  it("is a no-op when no existing bindings", async () => {
    dbModule._c.where.mockResolvedValueOnce([]);

    await cloneKnowledgeBindings("v1", "v2");

    expect(dbModule.db.insert).not.toHaveBeenCalled();
  });

  it("clones bindings to new version", async () => {
    dbModule._c.where.mockResolvedValueOnce([{ knowledgeBaseId: "kb-1" }]);

    await cloneKnowledgeBindings("v1", "v2");

    expect(dbModule.db.insert).toHaveBeenCalled();
  });
});

// ─── searchBoundKnowledgeBases ────────────────────────────────────────

describe("searchBoundKnowledgeBases", () => {
  it("returns empty when no bindings", async () => {
    dbModule._c.where.mockResolvedValueOnce([]); // getKnowledgeBindingsForVersion

    const result = await searchBoundKnowledgeBases({
      agentVersionId: "v1",
      workspaceId: "ws-1",
      knowledgeBaseIds: ["kb-1"],
      query: "test",
    });

    expect(result).toHaveLength(0);
  });
});

// ─── listProcessingDocuments ──────────────────────────────────────────

describe("listProcessingDocuments", () => {
  it("returns documents with processing status", async () => {
    dbModule._c.limit.mockResolvedValueOnce([{ id: "doc-1" }]);
    const result = await listProcessingDocuments(10);
    expect(result).toHaveLength(1);
  });
});

// ─── processDocumentIngestion ─────────────────────────────────────────

describe("processDocumentIngestion", () => {
  it("is a no-op when document not found", async () => {
    await processDocumentIngestion("nonexistent");
    expect(dbModule.db.update).not.toHaveBeenCalled();
  });

  it("is a no-op when document status is not processing", async () => {
    dbModule._c.limit.mockResolvedValueOnce([{ ...fakeDoc, status: "ready" }]);

    await processDocumentIngestion("doc-1");
    expect(dbModule.db.update).not.toHaveBeenCalled();
  });

  it("marks document as ready when chunks exist", async () => {
    // Q1: select document (limit terminal)
    // Q2: select chunks (where terminal on documentChunks)
    // Q3: update document status (where terminal on update)
    dbModule._c.limit.mockResolvedValueOnce([fakeDoc]);
    dbModule._c.where
      .mockReturnValueOnce(dbModule._c) // Q1 .where → chains to limit (already resolved)
      .mockResolvedValueOnce([{ id: "chunk-1" }]); // Q2 chunks

    await processDocumentIngestion("doc-1");

    expect(dbModule.db.update).toHaveBeenCalled();
    const updateSet = dbModule._c.set.mock.calls[0][0];
    expect(updateSet.status).toBe("ready");
  });

  it("marks document as failed when no chunks", async () => {
    dbModule._c.limit.mockResolvedValueOnce([fakeDoc]);
    dbModule._c.where
      .mockReturnValueOnce(dbModule._c) // chains to limit
      .mockResolvedValueOnce([]); // no chunks

    await processDocumentIngestion("doc-1");

    const updateSet = dbModule._c.set.mock.calls[0][0];
    expect(updateSet.status).toBe("failed");
  });
});
