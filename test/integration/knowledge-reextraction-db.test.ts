import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { db } from "@/server/infrastructure/db";
import {
  documents,
  documentChunks,
  knowledgeBases,
} from "@/server/infrastructure/db/schema";
import { storage } from "@/server/infrastructure/storage";
import { decryptValue, encryptValue } from "@/lib/crypto";
import { reextractDocumentSource } from "@/modules/knowledge/reextract-document-source";
import { reindexDocument } from "@/modules/knowledge/use-cases.list-documents";
import { DEFAULT_RAG_CONFIG } from "@/modules/knowledge/rag-config-schema";
import { createSharingFixture } from "./resource-sharing-db.fixture";
vi.mock("@/modules/knowledge/queue", () => ({
  recoverDocumentIngestionJob: vi.fn(),
  enqueueDocumentIngestion: vi.fn(),
}));

const suite = process.env.IAM_INTEGRATION_DATABASE_URL
  ? describe.sequential
  : describe.skip;
suite("re-extracting stored originals", () => {
  let fixture: Awaited<ReturnType<typeof createSharingFixture>>;
  beforeAll(async () => {
    fixture = await createSharingFixture();
  }, 60_000);
  afterAll(async () => {
    vi.restoreAllMocks();
    await fixture?.cleanup();
  });
  it("re-reads a renamed PowerPoint, preserves its identity and original, and leaves old chunks intact on failure", async () => {
    const [base] = await db
      .insert(knowledgeBases)
      .values({
        workspaceId: fixture.workspaceId,
        createdById: fixture.owner,
        name: "Reextraction",
      })
      .returning();
    const [document] = await db
      .insert(documents)
      .values({
        workspaceId: fixture.workspaceId,
        knowledgeBaseId: base.id,
        createdById: fixture.owner,
        title: "Diagnostic",
        mimeType:
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        sourceType: "upload",
        status: "ready",
        objectStorageKey: "test-original",
      })
      .returning();
    const [oldChunk] = await db
      .insert(documentChunks)
      .values({
        documentId: document.id,
        chunkIndex: 0,
        contentEncrypted: await encryptValue("Old incomplete extraction"),
      })
      .returning();
    const input = {
      documentId: document.id,
      knowledgeBaseId: base.id,
      workspaceId: fixture.workspaceId,
      userId: fixture.owner,
    };
    await expect(
      reindexDocument({ ...input, userId: fixture.member }),
    ).rejects.toThrow();
    await reindexDocument(input);
    const [queued] = await db
      .select()
      .from(documents)
      .where(eq(documents.id, document.id));
    expect(queued.sourceExtractionPending).toBe(true);
    const download = vi
      .spyOn(storage, "download")
      .mockRejectedValueOnce(new Error("storage offline"));
    await expect(
      reextractDocumentSource(queued, DEFAULT_RAG_CONFIG),
    ).rejects.toThrow("storage offline");
    expect(
      await db
        .select()
        .from(documentChunks)
        .where(eq(documentChunks.documentId, document.id)),
    ).toEqual([oldChunk]);
    download.mockResolvedValue(
      await readFile("test/fixtures/presentation-rag.pptx"),
    );
    const result = await reextractDocumentSource(queued, DEFAULT_RAG_CONFIG);
    expect(result).toMatchObject({
      id: document.id,
      title: "Diagnostic",
      objectStorageKey: "test-original",
      sourceExtractionPending: false,
    });
    const chunks = await db
      .select()
      .from(documentChunks)
      .where(eq(documentChunks.documentId, document.id));
    const text = (
      await Promise.all(chunks.map((c) => decryptValue(c.contentEncrypted!)))
    ).join("\n");
    expect(text).toContain("vérifier la validation qualité");
    expect(text).not.toContain("Old incomplete extraction");
  });
});
