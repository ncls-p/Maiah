import "pdf-parse/worker";

import { generateText, Output } from "ai";
import { PDFParse } from "pdf-parse";
import { z } from "zod";

import { logHandledWarning } from "@/lib/logger";
import { resolveOcrModel } from "@/modules/knowledge/rag-config";
import type { RagConfig } from "@/modules/knowledge/rag-config-schema";
import type { VisualRegion } from "@/modules/document-extraction/types";

export type VisualCandidate = {
  sourceKind: VisualRegion["sourceKind"];
  sourceRef: string;
  mediaType: string;
  data: Uint8Array;
};

const visualRegionsSchema = z.object({
  regions: z.array(
    z.object({
      kind: z.enum(["text", "diagram", "table", "image-description"]),
      boundingBox: z.object({
        x: z.number().int().min(0).max(1000),
        y: z.number().int().min(0).max(1000),
        width: z.number().int().min(1).max(1000),
        height: z.number().int().min(1).max(1000),
      }),
      text: z.string(),
      description: z.string(),
      confidence: z.number().min(0).max(1),
    }),
  ),
});

export function isSupportedOcrImage(mimeType: string) {
  return ["image/png", "image/jpeg", "image/webp", "image/gif"].includes(
    mimeType.toLowerCase().split(";", 1)[0],
  );
}

export async function inspectPdfVisualCandidates(input: {
  bytes: Uint8Array;
  minimumTextCharactersPerPage: number;
  maxVisualPages: number;
}) {
  const parser = new PDFParse({ data: Buffer.from(input.bytes) });
  try {
    const [text, images] = await Promise.all([
      parser.getText({ first: 500 }),
      parser.getImage({ first: 500, imageThreshold: 120 }),
    ]);
    const pagesWithImages = new Set(
      images.pages
        .filter((page) => page.images.length > 0)
        .map((page) => page.pageNumber),
    );
    const selectedPages = text.pages
      .filter(
        (page) =>
          page.text.replace(/\s/g, "").length <
            input.minimumTextCharactersPerPage || pagesWithImages.has(page.num),
      )
      .slice(0, input.maxVisualPages)
      .map((page) => page.num);
    if (selectedPages.length === 0) return [];
    const screenshots = await parser.getScreenshot({
      partial: selectedPages,
      desiredWidth: 1600,
      imageBuffer: true,
      imageDataUrl: false,
    });
    return screenshots.pages.map(
      (page): VisualCandidate => ({
        sourceKind: "page",
        sourceRef: `page:${page.pageNumber}`,
        mediaType: "image/png",
        data: page.data,
      }),
    );
  } finally {
    await parser.destroy();
  }
}

export async function runVisualOcr(input: {
  workspaceId: string;
  config: RagConfig;
  candidates: VisualCandidate[];
}) {
  const resolved = await resolveOcrModel(input.workspaceId, input.config);
  if (!resolved) {
    return {
      regions: [] as VisualRegion[],
      warnings: ["OCR is enabled but no compatible visual model is available."],
    };
  }

  const regions: VisualRegion[] = [];
  const warnings: string[] = [];
  for (const candidate of input.candidates.slice(
    0,
    input.config.extraction.ocr.maxVisualPages,
  )) {
    try {
      const result = await generateText({
        model: resolved.model,
        output: Output.object({ schema: visualRegionsSchema }),
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: [
                  "Extract only information that requires visual understanding.",
                  "Return text embedded in pixels and describe diagrams, schemas, charts, and meaningful images.",
                  "Do not recreate ordinary document tables or prose already handled by AnyDoc.",
                  input.config.extraction.ocr.describeDiagrams
                    ? "For diagrams, explain nodes, arrows, labels, grouping, and reading order."
                    : "Do not describe diagrams unless they contain otherwise unreadable text.",
                  "Coordinates use a 0..1000 plane relative to this image. Tight boxes are preferred.",
                  "Return no regions when the image adds no useful information.",
                ].join("\n"),
              },
              {
                type: "file",
                data: candidate.data,
                mediaType: candidate.mediaType,
                filename: candidate.sourceRef,
              },
            ],
          },
        ],
      });
      for (const region of result.output.regions) {
        regions.push({
          ...region,
          sourceKind: candidate.sourceKind,
          sourceRef: candidate.sourceRef,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(
        `Visual extraction failed for ${candidate.sourceRef}: ${message}`,
      );
      logHandledWarning("Visual OCR region extraction failed", {
        sourceKind: candidate.sourceKind,
        sourceRef: candidate.sourceRef,
        error: message,
      });
    }
  }
  return { regions, warnings };
}

export function visualRegionsMarkdown(regions: VisualRegion[]) {
  if (regions.length === 0) return "";
  return [
    "## Visual extraction",
    ...regions.map((region) => {
      const box = region.boundingBox;
      const coordinates = `x=${box.x}, y=${box.y}, width=${box.width}, height=${box.height}`;
      const body = [region.text.trim(), region.description.trim()]
        .filter(Boolean)
        .join("\n\n");
      return `### ${region.sourceRef} · ${region.kind}\n\n<!-- visual-region ${coordinates}; confidence=${region.confidence.toFixed(2)} -->\n\n${body}`;
    }),
  ].join("\n\n");
}
