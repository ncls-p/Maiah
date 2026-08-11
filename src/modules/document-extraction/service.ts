import { extractWithAnydoc } from "@/modules/document-extraction/anydoc-adapter";
import type {
  DocumentExtractionInput,
  DocumentExtractionResult,
  VisualCandidate,
} from "@/modules/document-extraction/types";
import { inspectPdfVisualCandidates } from "@/modules/document-extraction/pdf-visual-candidates";
import {
  isSupportedOcrImage,
  runVisualOcr,
  visualRegionsMarkdown,
} from "@/modules/document-extraction/visual-ocr";
import { getDefaultRagConfig } from "@/modules/knowledge/rag-config";
import { DEFAULT_RAG_CONFIG } from "@/modules/knowledge/rag-config-schema";

function normalizedMimeType(value?: string) {
  return value?.toLowerCase().split(";", 1)[0] ?? "";
}

export async function extractDocument(
  input: DocumentExtractionInput,
): Promise<DocumentExtractionResult | null> {
  const anydoc = await extractWithAnydoc(input.fileName, input.bytes);
  const mimeType = normalizedMimeType(input.mimeType);
  const isImage = isSupportedOcrImage(mimeType);
  if (!anydoc && !isImage) return null;

  const config =
    input.config ??
    (input.workspaceId ? await getDefaultRagConfig() : DEFAULT_RAG_CONFIG);
  const warnings: string[] = [];
  let candidates: VisualCandidate[] = [];

  if (config.extraction.ocr.enabled) {
    if (anydoc?.format === "pdf") {
      candidates = await inspectPdfVisualCandidates({
        bytes: input.bytes,
        minimumTextCharactersPerPage:
          config.extraction.ocr.minimumTextCharactersPerPage,
        maxVisualPages: config.extraction.ocr.maxVisualPages,
      });
    } else if (anydoc) {
      candidates = anydoc.imageAssets
        .filter((asset) => isSupportedOcrImage(asset.mediaType))
        .slice(0, config.extraction.ocr.maxVisualPages)
        .map((asset) => ({
          sourceKind: "asset" as const,
          sourceRef: asset.originPart || `asset:${asset.id}`,
          mediaType: asset.mediaType,
          data: new Uint8Array(asset.data),
        }));
    } else if (isImage) {
      candidates = [
        {
          sourceKind: "image",
          sourceRef: input.fileName,
          mediaType: mimeType,
          data: input.bytes,
        },
      ];
    }
  }

  let visualRegions = [] as DocumentExtractionResult["visualRegions"];
  if (candidates.length > 0) {
    if (!input.workspaceId) {
      warnings.push(
        "Visual regions were detected but OCR needs a workspace model context.",
      );
    } else {
      const visual = await runVisualOcr({
        workspaceId: input.workspaceId,
        config,
        candidates,
      });
      visualRegions = visual.regions;
      warnings.push(...visual.warnings);
    }
  }

  const deterministicMarkdown = anydoc?.markdown.trim() ?? "";
  const visualMarkdown = visualRegionsMarkdown(visualRegions);
  const markdown = [deterministicMarkdown, visualMarkdown]
    .filter(Boolean)
    .join("\n\n");

  return {
    markdown,
    engine: anydoc ? "anydoc" : "none",
    visualRegions,
    ocrApplied: visualRegions.length > 0,
    warnings,
  };
}
