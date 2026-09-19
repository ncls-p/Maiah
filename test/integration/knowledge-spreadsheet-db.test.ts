import ExcelJS from "exceljs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/server/infrastructure/db";
import {
  documents,
  documentChunks,
  knowledgeBases,
} from "@/server/infrastructure/db/schema";
import { storage } from "@/server/infrastructure/storage";
import { decryptValue } from "@/lib/crypto";
import { extractKnowledgeUploads } from "@/modules/knowledge/file-ingestion";
import { ingestTextDocument } from "@/modules/knowledge/use-cases.chunk-text";
import { searchKnowledgeBase } from "@/modules/knowledge/use-cases.search-knowledge-base";
import { reextractDocumentSource } from "@/modules/knowledge/reextract-document-source";
import { DEFAULT_RAG_CONFIG } from "@/modules/knowledge/rag-config-schema";
import { createSharingFixture } from "./resource-sharing-db.fixture";
vi.mock("@/modules/knowledge/queue", () => ({
  enqueueDocumentIngestion: vi.fn(),
}));
const suite = process.env.IAM_INTEGRATION_DATABASE_URL
  ? describe.sequential
  : describe.skip;
suite("Excel persistence and retrieval", () => {
  let fixture: Awaited<ReturnType<typeof createSharingFixture>>;
  beforeAll(async () => {
    fixture = await createSharingFixture();
  }, 60_000);
  afterAll(async () => {
    vi.restoreAllMocks();
    await fixture?.cleanup();
  });
  it("preserves row chunks through ingestion, keyword retrieval and original re-extraction", async () => {
    const [base] = await db
      .insert(knowledgeBases)
      .values({
        workspaceId: fixture.workspaceId,
        createdById: fixture.owner,
        name: "ITSM Excel",
        ragConfigJson: {
          ...DEFAULT_RAG_CONFIG,
          retrieval: DEFAULT_RAG_CONFIG.retrieval,
        },
      })
      .returning();
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet("Incidents");
    sheet.addRow(["Number", "Description"]);
    sheet.addRow(["INC765432", "VPN authentication failure"]);
    sheet.addRow(["INC111111", "Printer is offline"]);
    const bytes = new Uint8Array(await book.xlsx.writeBuffer());
    const result = await extractKnowledgeUploads([
      { fileName: "incidents.xlsx", bytes },
    ]);
    expect(result.rejected).toEqual([]);
    const upload = vi
      .spyOn(storage, "upload")
      .mockResolvedValue("test-original");
    const doc = await ingestTextDocument({
      ...result.files[0],
      workspaceId: fixture.workspaceId,
      knowledgeBaseId: base.id,
      userId: fixture.owner,
      sourceType: "upload",
    });
    expect(upload).toHaveBeenCalled();
    const readChunks = () =>
      db
        .select()
        .from(documentChunks)
        .where(eq(documentChunks.documentId, doc.id))
        .orderBy(documentChunks.chunkIndex);
    const initial = await readChunks();
    expect(initial).toHaveLength(2);
    expect(initial[0].metadataJson).toMatchObject({
      sourceFormat: "xlsx",
      row: 2,
    });
    expect(initial[0].contentEncrypted).not.toContain("INC765432");
    await db
      .update(documents)
      .set({ status: "ready" })
      .where(eq(documents.id, doc.id));
    const hits = await searchKnowledgeBase({
      workspaceId: fixture.workspaceId,
      knowledgeBaseId: base.id,
      query: "INC765432",
    });
    expect(hits[0].content).toContain('A "Number": INC765432');
    expect(hits[0].content).toContain(
      'B "Description": VPN authentication failure',
    );
    expect(hits[0].content).toContain("Excel row 2");
    const [queued] = await db
      .update(documents)
      .set({
        title: "Renamed ITSM export",
        status: "processing",
        sourceExtractionPending: true,
      })
      .where(eq(documents.id, doc.id))
      .returning();
    const download = vi
      .spyOn(storage, "download")
      .mockResolvedValue(new Uint8Array([1, 2]));
    await expect(
      reextractDocumentSource(queued, DEFAULT_RAG_CONFIG),
    ).rejects.toThrow();
    expect(await readChunks()).toEqual(initial);
    download.mockResolvedValue(bytes);
    await reextractDocumentSource(queued, DEFAULT_RAG_CONFIG);
    const replaced = await readChunks();
    expect(replaced.map((c) => c.metadataJson)).toEqual(
      initial.map((c) => c.metadataJson),
    );
    expect(
      await Promise.all(replaced.map((c) => decryptValue(c.contentEncrypted!))),
    ).toEqual(
      await Promise.all(initial.map((c) => decryptValue(c.contentEncrypted!))),
    );
  });
});
