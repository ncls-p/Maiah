import {
  generateText,
  Output,
  type LanguageModel,
  type ModelMessage,
} from "ai";

import { logger, logHandledWarning } from "@/lib/logger";
import { normalizeOcrCandidate } from "@/modules/document-extraction/ocr-image-normalization";
import {
  parseVisualRegionsJson,
  visualRegionsSchema,
} from "@/modules/document-extraction/visual-ocr-json";
import type {
  VisualCandidate,
  VisualRegion,
} from "@/modules/document-extraction/types";
import { resolveOcrModel } from "@/modules/knowledge/rag-config";
import type { RagConfig } from "@/modules/knowledge/rag-config-schema";

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
  const extractionInstructions =
    candidate.sourceKind === "page"
      ? [
          "This image is an entire document page with insufficient native text extraction.",
          "Transcribe all visible document text in reading order, including ordinary prose, headings, labels, footnotes, and form fields.",
          "Do not omit prose on the assumption that another extractor already handled it.",
          "Also describe diagrams, charts, and meaningful images when they add information.",
        ]
      : [
          "Extract only information that requires visual understanding.",
          "Return text embedded in pixels and describe diagrams, schemas, charts, and meaningful images.",
          "Do not recreate ordinary document tables or prose already handled by AnyDoc.",
        ];
  return [
    {
      role: "user",
      content: [
        {
          type: "text",
          text: [
            ...extractionInstructions,
            describeDiagrams
              ? "For diagrams, explain nodes, arrows, labels, grouping, and reading order."
              : "Do not describe diagrams unless they contain otherwise unreadable text.",
            "Return a JSON object with a regions array and no surrounding prose or Markdown.",
            'Use exactly this shape for every item: {"kind":"text","text":"visible text","description":"","confidence":0.9}.',
            'Allowed kind values are exactly "text", "diagram", "table", and "image-description".',
            "Every region must include kind, text, description, and confidence, even when text or description is empty.",
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
    if (parsed.regionKeys.length > 0) {
      logger.warn("Visual OCR JSON text fallback normalized provider fields", {
        ...context,
        regionKeys: parsed.regionKeys,
      });
    }
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
      const normalizedCandidate = await normalizeOcrCandidate(candidate);
      const generatedRegions = await generateVisualRegions(
        resolved.model,
        visualOcrMessages(
          normalizedCandidate,
          input.config.extraction.ocr.describeDiagrams,
        ),
        {
          providerId: resolved.providerId,
          modelId: input.config.extraction.ocr.modelId,
          sourceKind: normalizedCandidate.sourceKind,
          sourceRef: normalizedCandidate.sourceRef,
          mediaType: normalizedCandidate.mediaType,
          imageBytes: normalizedCandidate.data.byteLength,
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
      const body = [region.text.trim(), region.description.trim()]
        .filter(Boolean)
        .join("\n\n");
      return `### ${region.sourceRef} · ${region.kind}\n\n<!-- visual-confidence=${region.confidence.toFixed(2)} -->\n\n${body}`;
    }),
  ].join("\n\n");
}
