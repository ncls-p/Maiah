import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generateText: vi.fn(),
  resolveOcrModel: vi.fn(),
}));

vi.mock("ai", () => ({
  generateText: mocks.generateText,
  Output: {
    object: vi.fn((value) => value),
    text: vi.fn(() => ({ type: "text" })),
  },
}));

vi.mock("pdf-parse", () => ({ PDFParse: class {} }));

vi.mock("@/modules/knowledge/rag-config", () => ({
  resolveOcrModel: mocks.resolveOcrModel,
}));

import { logger } from "@/lib/logger";
import { runVisualOcr } from "@/modules/document-extraction/visual-ocr";
import { DEFAULT_RAG_CONFIG } from "@/modules/knowledge/rag-config-schema";

const ocrConfig = {
  ...DEFAULT_RAG_CONFIG,
  extraction: {
    ...DEFAULT_RAG_CONFIG.extraction,
    ocr: {
      ...DEFAULT_RAG_CONFIG.extraction.ocr,
      enabled: true,
      modelId: "qwen-vision",
      maxVisualPages: 2,
    },
  },
};

function candidate(sourceRef: string, data = new Uint8Array([1])) {
  return {
    sourceKind: "page" as const,
    sourceRef,
    mediaType: "image/png",
    data,
  };
}

describe("visual OCR provider compatibility", () => {
  beforeEach(() => vi.clearAllMocks());

  it("falls back to locally validated JSON", async () => {
    mocks.resolveOcrModel.mockResolvedValue({ model: {}, providerId: "p1" });
    mocks.generateText
      .mockRejectedValueOnce(new Error("structured output unsupported"))
      .mockResolvedValueOnce({
        output: JSON.stringify({
          regions: [
            {
              kind: "text",
              text: "Scanned text",
              description: "",
              confidence: 0.95,
            },
          ],
        }),
      });

    const result = await runVisualOcr({
      workspaceId: "22222222-2222-4222-8222-222222222222",
      config: ocrConfig,
      candidates: [candidate("page:1")],
    });

    expect(mocks.generateText).toHaveBeenCalledTimes(2);
    expect(result.warnings).toEqual([]);
    expect(result.regions[0]).toMatchObject({
      kind: "text",
      sourceRef: "page:1",
      text: "Scanned text",
    });
  });

  it("normalizes common vision-provider region aliases", async () => {
    mocks.resolveOcrModel.mockResolvedValue({ model: {}, providerId: "p1" });
    mocks.generateText
      .mockRejectedValueOnce(new Error("structured output unsupported"))
      .mockResolvedValueOnce({
        output: JSON.stringify({
          regions: [
            {
              kind: "ocr_text",
              bbox: [0.01, 0.02, 0.3, 0.1],
              content: "Aliased scanned text",
              score: 95,
            },
          ],
        }),
      });

    const result = await runVisualOcr({
      workspaceId: "22222222-2222-4222-8222-222222222222",
      config: {
        ...ocrConfig,
        extraction: {
          ...ocrConfig.extraction,
          ocr: { ...ocrConfig.extraction.ocr, describeDiagrams: false },
        },
      },
      candidates: [candidate("page:3")],
    });

    expect(result.warnings).toEqual([]);
    expect(result.regions[0]).toMatchObject({
      kind: "text",
      text: "Aliased scanned text",
      description: "",
      confidence: 0.95,
    });
  });

  it("logs safe provider diagnostics without request payloads", async () => {
    const providerError = Object.assign(new Error("provider failed"), {
      statusCode: 500,
      isRetryable: true,
      responseBody: "upstream failure",
    });
    const warnSpy = vi
      .spyOn(logger, "warn")
      .mockImplementation(() => undefined);
    mocks.resolveOcrModel.mockResolvedValue({ model: {}, providerId: "p1" });
    mocks.generateText
      .mockRejectedValueOnce(providerError)
      .mockRejectedValueOnce(providerError);

    await runVisualOcr({
      workspaceId: "22222222-2222-4222-8222-222222222222",
      config: ocrConfig,
      candidates: [candidate("page:2", new Uint8Array([1, 2, 3]))],
    });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        providerId: "p1",
        modelId: "qwen-vision",
        sourceRef: "page:2",
        imageBytes: 3,
        statusCode: 500,
        isRetryable: true,
        responseBody: "upstream failure",
      }),
    );
    warnSpy.mockRestore();
  });
});
