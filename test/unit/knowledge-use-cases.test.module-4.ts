import { describe, expect, it, vi } from "vitest";

import {
  archiveDocument,
  reindexDocument,
  reindexKnowledgeBaseDocuments,
  scoreContent,
} from "@/modules/knowledge/use-cases";
import { recoverDocumentIngestionJob } from "@/modules/knowledge/queue";
import {
  dbModule,
  fakeDoc,
  fakeKb,
} from "./knowledge-use-cases.test.db-module";

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

// ─── reindexDocument ──────────────────────────────────────────────────

describe("reindexDocument", () => {
  it("requeues a ready document and clears its error message", async () => {
    const readyDoc = {
      ...fakeDoc,
      status: "ready",
      processingProgress: 100,
      errorMessage:
        "Embedding model unavailable; indexed for keyword search only",
    };
    dbModule._c.limit
      .mockResolvedValueOnce([fakeKb])
      .mockResolvedValueOnce([readyDoc]);

    await reindexDocument({
      documentId: "doc-1",
      knowledgeBaseId: "kb-1",
      workspaceId: "ws-1",
      userId: "user-1",
    });

    expect(dbModule.db.update).toHaveBeenCalled();
    expect(dbModule._c.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "processing",
        processingStage: "queued",
        errorMessage: null,
      }),
    );
    expect(recoverDocumentIngestionJob).toHaveBeenCalledWith({
      documentId: "doc-1",
      workspaceId: "ws-1",
      knowledgeBaseId: "kb-1",
    });
  });

  it("rejects documents that are already processing", async () => {
    dbModule._c.limit
      .mockResolvedValueOnce([fakeKb])
      .mockResolvedValueOnce([{ ...fakeDoc, status: "processing" }]);

    await expect(
      reindexDocument({
        documentId: "doc-1",
        knowledgeBaseId: "kb-1",
        workspaceId: "ws-1",
        userId: "user-1",
      }),
    ).rejects.toThrow("Document is already processing");
    expect(recoverDocumentIngestionJob).not.toHaveBeenCalled();
  });

  it("throws when the document does not exist", async () => {
    dbModule._c.limit.mockResolvedValueOnce([fakeKb]).mockResolvedValueOnce([]);

    await expect(
      reindexDocument({
        documentId: "doc-404",
        knowledgeBaseId: "kb-1",
        workspaceId: "ws-1",
        userId: "user-1",
      }),
    ).rejects.toThrow("Document not found");
  });
});

// ─── reindexKnowledgeBaseDocuments ────────────────────────────────────

describe("reindexKnowledgeBaseDocuments", () => {
  it("requeues every non-processing document and reports the count", async () => {
    const readyDoc = { ...fakeDoc, status: "ready" };
    const failedDoc = { ...fakeDoc, id: "doc-2", status: "failed" };
    dbModule._c.limit.mockResolvedValueOnce([fakeKb]);
    dbModule._c.where
      .mockReturnValueOnce(dbModule._c) // knowledge base lookup → chains to limit
      .mockResolvedValueOnce([readyDoc, failedDoc]); // non-processing documents

    const result = await reindexKnowledgeBaseDocuments({
      knowledgeBaseId: "kb-1",
      workspaceId: "ws-1",
      userId: "user-1",
    });

    expect(result).toEqual({ queued: 2 });
    expect(vi.mocked(recoverDocumentIngestionJob)).toHaveBeenCalledTimes(2);
  });

  it("throws when knowledge base not found", async () => {
    await expect(
      reindexKnowledgeBaseDocuments({
        knowledgeBaseId: "nonexistent",
        workspaceId: "ws-1",
        userId: "user-1",
      }),
    ).rejects.toThrow("Knowledge base not found");
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
