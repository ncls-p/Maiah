import { encryptValue } from "@/lib/crypto";
import { extractKnowledgeSource } from "./extract-knowledge-source";
import { db } from "@/server/infrastructure/db";
import { documents, documentChunks } from "@/server/infrastructure/db/schema";
import { storage } from "@/server/infrastructure/storage";
import { eq } from "drizzle-orm";
import type { RagConfig } from "./rag-config-schema";
import { chunkText } from "./use-cases.chunk-text";

/** Keep old chunks intact until the complete replacement has been extracted. */
export async function reextractDocumentSource(
  document: typeof documents.$inferSelect,
  config: RagConfig,
) {
  if (!document.objectStorageKey)
    throw new Error("Original document is unavailable");
  const bytes = await storage.download(document.objectStorageKey);
  const extracted = await extractKnowledgeSource({
    workspaceId: document.workspaceId,
    fileName: document.title,
    mimeType: document.mimeType ?? undefined,
    bytes,
    config,
  });
  if (!extracted.text || extracted.status !== "readable") {
    throw new Error(
      extracted.message ||
        "The original could not be fully extracted; previous content was preserved.",
    );
  }
  const chunks = await Promise.all(
    (
      extracted.chunks ??
      chunkText(extracted.text, config.chunking).map((content) => ({
        content,
        metadata: {},
      }))
    ).map(async (chunk, chunkIndex) => ({
      documentId: document.id,
      chunkIndex,
      contentEncrypted: await encryptValue(chunk.content),
      tokenCount: Math.ceil(chunk.content.length / 4),
      metadataJson: { source: document.sourceType, ...chunk.metadata },
    })),
  );
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(documents)
      .where(eq(documents.id, document.id))
      .for("update");
    if (
      !current ||
      current.status !== "processing" ||
      !current.sourceExtractionPending
    )
      return null;
    await tx
      .delete(documentChunks)
      .where(eq(documentChunks.documentId, document.id));
    await tx.insert(documentChunks).values(chunks);
    const [updated] = await tx
      .update(documents)
      .set({
        sourceExtractionPending: false,
        extractionWarning: extracted.message ?? null,
        processingStage: "chunked",
        processingProgress: 20,
        updatedAt: new Date(),
      })
      .where(eq(documents.id, document.id))
      .returning();
    return updated;
  });
}
