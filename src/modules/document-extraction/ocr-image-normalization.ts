import sharp from "sharp";

import { logger } from "@/lib/logger";
import type { VisualCandidate } from "@/modules/document-extraction/types";

const NORMALIZATION_THRESHOLD_BYTES = 250_000;
const MAX_OCR_IMAGE_WIDTH = 1_200;
const MAX_OCR_IMAGE_HEIGHT = 1_600;

export async function normalizeOcrCandidate(
  candidate: VisualCandidate,
): Promise<VisualCandidate> {
  if (candidate.data.byteLength < NORMALIZATION_THRESHOLD_BYTES) {
    return candidate;
  }
  try {
    const output = await sharp(candidate.data, { failOn: "warning" })
      .autoOrient()
      .resize({
        width: MAX_OCR_IMAGE_WIDTH,
        height: MAX_OCR_IMAGE_HEIGHT,
        fit: "inside",
        withoutEnlargement: true,
      })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();
    if (output.byteLength >= candidate.data.byteLength) return candidate;

    logger.info("Visual OCR image normalized", {
      sourceKind: candidate.sourceKind,
      sourceRef: candidate.sourceRef,
      inputMediaType: candidate.mediaType,
      inputBytes: candidate.data.byteLength,
      outputMediaType: "image/jpeg",
      outputBytes: output.byteLength,
    });
    return {
      ...candidate,
      mediaType: "image/jpeg",
      data: new Uint8Array(output),
    };
  } catch (error) {
    logger.warn("Visual OCR image normalization failed; using original", {
      sourceKind: candidate.sourceKind,
      sourceRef: candidate.sourceRef,
      mediaType: candidate.mediaType,
      imageBytes: candidate.data.byteLength,
      error: error instanceof Error ? error.message : String(error),
    });
    return candidate;
  }
}
