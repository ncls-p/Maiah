import { beforeEach,describe,expect,it,vi } from "vitest";

const mocks = vi.hoisted(() => ({
  destroy: vi.fn(),
  generateText: vi.fn(),
  getImage: vi.fn(),
  getScreenshot: vi.fn(),
  getText: vi.fn(),
  resolveOcrModel: vi.fn(),
}));

vi.mock("ai", () => ({
  generateText: mocks.generateText,
  Output: { object: vi.fn((value) => value) },
}));

vi.mock("pdf-parse", () => ({
  PDFParse: class {
    getText = mocks.getText;
    getImage = mocks.getImage;
    getScreenshot = mocks.getScreenshot;
    destroy = mocks.destroy;
  },
}));

vi.mock("@/modules/knowledge/rag-config", () => ({
  resolveOcrModel: mocks.resolveOcrModel,
}));

import {
inspectPdfVisualCandidates,
isSupportedOcrImage,
runVisualOcr,
visualRegionsMarkdown,
} from "@/modules/document-extraction/visual-ocr";
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

describe("visual OCR", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("selects only low-text PDF pages or pages containing images", async () => {
    mocks.getText.mockResolvedValue({
      pages: [
        { num: 1, text: "scan" },
        { num: 2, text: "A".repeat(200) },
        { num: 3, text: "B".repeat(200) },
      ],
    });
    mocks.getImage.mockResolvedValue({
      pages: [
        { pageNumber: 1, images: [] },
        { pageNumber: 2, images: [{ width: 400, height: 300 }] },
      ],
    });
    mocks.getScreenshot.mockResolvedValue({
      pages: [
        { pageNumber: 1, data: new Uint8Array([1]) },
        { pageNumber: 2, data: new Uint8Array([2]) },
      ],
    });

    const candidates = await inspectPdfVisualCandidates({
      bytes: new Uint8Array([1, 2, 3]),
      minimumTextCharactersPerPage: 80,
      maxVisualPages: 2,
    });

    expect(mocks.getScreenshot).toHaveBeenCalledWith(
      expect.objectContaining({ partial: [1, 2] }),
    );
    expect(candidates.map((candidate) => candidate.sourceRef)).toEqual([
      "page:1",
      "page:2",
    ]);
    expect(mocks.destroy).toHaveBeenCalledOnce();
  });

  it("skips rendering when no PDF page needs visual extraction", async () => {
    mocks.getText.mockResolvedValue({
      pages: [{ num: 1, text: "Readable text ".repeat(20) }],
    });
    mocks.getImage.mockResolvedValue({ pages: [] });

    await expect(
      inspectPdfVisualCandidates({
        bytes: new Uint8Array([1]),
        minimumTextCharactersPerPage: 20,
        maxVisualPages: 2,
      }),
    ).resolves.toEqual([]);
    expect(mocks.getScreenshot).not.toHaveBeenCalled();
    expect(mocks.destroy).toHaveBeenCalledOnce();
  });

  it("returns coordinate-aware regions from the configured vision model", async () => {
    mocks.resolveOcrModel.mockResolvedValue({ model: {}, providerId: "p1" });
    mocks.generateText.mockResolvedValue({
      output: {
        regions: [
          {
            kind: "diagram",
            boundingBox: { x: 10, y: 20, width: 300, height: 200 },
            text: "A → B",
            description: "Dependency diagram",
            confidence: 0.9,
          },
        ],
      },
    });

    const result = await runVisualOcr({
      workspaceId: "22222222-2222-4222-8222-222222222222",
      config: ocrConfig,
      candidates: [
        {
          sourceKind: "page",
          sourceRef: "page:4",
          mediaType: "image/png",
          data: new Uint8Array([1, 2]),
        },
      ],
    });

    expect(result.warnings).toEqual([]);
    expect(result.regions).toEqual([
      expect.objectContaining({
        kind: "diagram",
        sourceKind: "page",
        sourceRef: "page:4",
      }),
    ]);
    expect(mocks.generateText).toHaveBeenCalledOnce();
  });

  it("reports missing models and per-candidate provider failures", async () => {
    mocks.resolveOcrModel.mockResolvedValueOnce(null);
    await expect(
      runVisualOcr({
        workspaceId: "22222222-2222-4222-8222-222222222222",
        config: ocrConfig,
        candidates: [],
      }),
    ).resolves.toMatchObject({
      regions: [],
      warnings: [expect.stringContaining("no compatible visual model")],
    });

    mocks.resolveOcrModel.mockResolvedValueOnce({
      model: {},
      providerId: "p1",
    });
    mocks.generateText.mockRejectedValueOnce(new Error("provider unavailable"));
    const failed = await runVisualOcr({
      workspaceId: "22222222-2222-4222-8222-222222222222",
      config: ocrConfig,
      candidates: [
        {
          sourceKind: "asset",
          sourceRef: "word/media/image1.png",
          mediaType: "image/png",
          data: new Uint8Array([1]),
        },
      ],
    });
    expect(failed.regions).toEqual([]);
    expect(failed.warnings[0]).toContain("provider unavailable");
  });

  it("recognizes supported images and renders empty provenance safely", () => {
    expect(isSupportedOcrImage("image/jpeg; charset=binary")).toBe(true);
    expect(isSupportedOcrImage("image/svg+xml")).toBe(false);
    expect(visualRegionsMarkdown([])).toBe("");
  });
});
