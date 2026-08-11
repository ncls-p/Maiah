import "pdf-parse/worker";

import {
  generateText,
  Output,
  type LanguageModel,
  type ModelMessage,
} from "ai";
import { PDFParse } from "pdf-parse";
import { z } from "zod";

import { logger, logHandledWarning } from "@/lib/logger";
import type { VisualRegion } from "@/modules/document-extraction/types";
import { resolveOcrModel } from "@/modules/knowledge/rag-config";
import type { RagConfig } from "@/modules/knowledge/rag-config-schema";

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

type VisualOcrLogContext = {
  providerId: string;
  modelId: string;
  sourceKind: VisualCandidate["sourceKind"];
  sourceRef: string;
  mediaType: string;
  imageBytes: number;
};

function safeAiErrorDetails(error: unknown) {
  if (!(error instanceof Error)) return { error: String(error) };
  const details = error as Error & {
    statusCode?: unknown;
    responseBody?: unknown;
    isRetryable?: unknown;
  };
  return {
    errorName: error.name,
    error: error.message,
    ...(typeof details.statusCode === "number" && {
      statusCode: details.statusCode,
    }),
    ...(typeof details.isRetryable === "boolean" && {
      isRetryable: details.isRetryable,
    }),
    ...(typeof details.responseBody === "string" && {
      responseBody: details.responseBody.slice(0, 2_000),
    }),
  };
}

function visualOcrMessages(
  candidate: VisualCandidate,
  describeDiagrams: boolean,
): ModelMessage[] {
  return [
    {
      role: "user",
      content: [
        {
          type: "text",
          text: [
            "Extract only information that requires visual understanding.",
            "Return text embedded in pixels and describe diagrams, schemas, charts, and meaningful images.",
            "Do not recreate ordinary document tables or prose already handled by AnyDoc.",
            describeDiagrams
              ? "For diagrams, explain nodes, arrows, labels, grouping, and reading order."
              : "Do not describe diagrams unless they contain otherwise unreadable text.",
            "Coordinates use a 0..1000 plane relative to this image. Tight boxes are preferred.",
            "Return a JSON object with a regions array and no surrounding prose or Markdown.",
            'Use exactly this shape for every item: {"kind":"text","boundingBox":{"x":0,"y":0,"width":1000,"height":1000},"text":"visible text","description":"","confidence":0.9}.',
            'Allowed kind values are exactly "text", "diagram", "table", and "image-description".',
            "Every region must include kind, boundingBox, text, description, and confidence, even when text or description is empty.",
            "Return an empty regions array when the image adds no useful information.",
          ].join("\n"),
        },
        {
          type: "file",
          // PDF screenshots can be backed by worker-specific typed arrays.
          // Cross the provider boundary with plain base64 so runtimes never
          // attempt to transfer the worker-owned object itself.
          data: Buffer.from(candidate.data).toString("base64"),
          mediaType: candidate.mediaType,
          filename: candidate.sourceRef,
        },
      ],
    },
  ];
}

function parseVisualRegionsJson(value: string) {
  const withoutFence = value
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  const start = withoutFence.indexOf("{");
  const end = withoutFence.lastIndexOf("}");
  const json =
    start >= 0 && end >= start
      ? withoutFence.slice(start, end + 1)
      : withoutFence;
  return visualRegionsSchema.parse(JSON.parse(json));
}

async function generateVisualRegions(
  model: LanguageModel,
  messages: ModelMessage[],
  context: VisualOcrLogContext,
) {
  const startedAt = Date.now();
  try {
    const structured = await generateText({
      model,
      output: Output.object({ schema: visualRegionsSchema }),
      messages,
    });
    logger.info("Visual OCR structured extraction completed", {
      ...context,
      regionCount: structured.output.regions.length,
      durationMs: Date.now() - startedAt,
    });
    return structured.output.regions;
  } catch (error) {
    // Some OpenAI-compatible servers return 5xx for response_format schemas.
    // Fall back to plain text while preserving local schema validation.
    logger.warn(
      "Visual OCR structured extraction failed; retrying as JSON text",
      {
        ...context,
        durationMs: Date.now() - startedAt,
        ...safeAiErrorDetails(error),
      },
    );
    const fallbackStartedAt = Date.now();
    const plain = await generateText({
      model,
      output: Output.text(),
      messages,
    });
    const parsed = parseVisualRegionsJson(plain.output);
    logger.info("Visual OCR JSON text fallback completed", {
      ...context,
      regionCount: parsed.regions.length,
      durationMs: Date.now() - fallbackStartedAt,
    });
    return parsed.regions;
  }
}

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
  const startedAt = Date.now();
  const parser = new PDFParse({ data: Buffer.from(input.bytes) });
  try {
    // PDFParse shares a worker-backed document between these operations. Running
    // them concurrently can make the worker transfer the same PDF object twice
    // and fail with "Cannot transfer object of unsupported type" on scanned PDFs.
    const text = await parser.getText({ first: 500 });
    const images = await parser.getImage({
      first: 500,
      imageThreshold: 120,
    });
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
    if (selectedPages.length === 0) {
      logger.info("PDF visual candidate inspection completed", {
        pdfBytes: input.bytes.byteLength,
        inspectedPageCount: text.pages.length,
        selectedPageCount: 0,
        durationMs: Date.now() - startedAt,
      });
      return [];
    }
    const screenshots = await parser.getScreenshot({
      partial: selectedPages,
      desiredWidth: 1600,
      imageBuffer: true,
      imageDataUrl: false,
    });
    const candidates = screenshots.pages.map((page): VisualCandidate => ({
      sourceKind: "page",
      sourceRef: `page:${page.pageNumber}`,
      mediaType: "image/png",
      data: page.data,
    }));
    logger.info("PDF visual candidate inspection completed", {
      pdfBytes: input.bytes.byteLength,
      inspectedPageCount: text.pages.length,
      pagesWithImagesCount: pagesWithImages.size,
      selectedPageCount: candidates.length,
      selectedPages,
      renderedBytes: candidates.reduce(
        (total, candidate) => total + candidate.data.byteLength,
        0,
      ),
      durationMs: Date.now() - startedAt,
    });
    return candidates;
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
      const generatedRegions = await generateVisualRegions(
        resolved.model,
        visualOcrMessages(
          candidate,
          input.config.extraction.ocr.describeDiagrams,
        ),
        {
          providerId: resolved.providerId,
          modelId: input.config.extraction.ocr.modelId,
          sourceKind: candidate.sourceKind,
          sourceRef: candidate.sourceRef,
          mediaType: candidate.mediaType,
          imageBytes: candidate.data.byteLength,
        },
      );
      for (const region of generatedRegions) {
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
        providerId: resolved.providerId,
        modelId: input.config.extraction.ocr.modelId,
        sourceKind: candidate.sourceKind,
        sourceRef: candidate.sourceRef,
        mediaType: candidate.mediaType,
        imageBytes: candidate.data.byteLength,
        ...safeAiErrorDetails(error),
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
