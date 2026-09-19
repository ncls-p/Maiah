import { extractUploadedFileText } from "@/modules/chat/attachments";
import { extractSpreadsheet } from "./extract-spreadsheet";
import { DEFAULT_RAG_CONFIG, type RagConfig } from "./rag-config-schema";
import type { KnowledgeSourceChunk } from "./spreadsheet-chunks";

/** Shared by uploads and re-extraction of stored originals. */
export async function extractKnowledgeSource(input: {
  fileName: string;
  mimeType?: string;
  bytes: Uint8Array;
  workspaceId?: string;
  config?: RagConfig;
}) {
  const spreadsheet = await extractSpreadsheet({
    ...input,
    maxCharacters: (input.config ?? DEFAULT_RAG_CONFIG).chunking.maxCharacters,
  });
  if (spreadsheet) return spreadsheet;
  const extracted = await extractUploadedFileText(input);
  return {
    ...extracted,
    chunks: undefined as KnowledgeSourceChunk[] | undefined,
  };
}
