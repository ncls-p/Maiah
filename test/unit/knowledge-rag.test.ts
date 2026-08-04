import { describe, expect, it } from "vitest";

import { chunkText } from "@/modules/knowledge/use-cases";
import {
  DEFAULT_RAG_CONFIG,
  parseRagConfig,
  ragConfigSchema,
} from "@/modules/knowledge/rag-config";

describe("knowledge RAG configuration", () => {
  it("starts unconfigured and preserves lexical fallback", () => {
    expect(DEFAULT_RAG_CONFIG.embedding.modelId).toBe("");
    expect(DEFAULT_RAG_CONFIG.reranking.enabled).toBe(false);
  });

  it("accepts provider and model overrides without fixing dimensions", () => {
    const config = ragConfigSchema.parse({
      embedding: {
        providerId: "11111111-1111-4111-8111-111111111111",
        modelId: "custom/embedding-model",
      },
      chunking: { maxCharacters: 800, overlapCharacters: 120 },
      retrieval: { candidateCount: 12, resultCount: 4 },
      reranking: {
        enabled: true,
        modelId: "custom/reranking-model",
      },
    });

    expect(config.embedding.dimensions).toBeNull();
    expect(config.reranking.modelId).toBe("custom/reranking-model");
    expect(parseRagConfig(config)).toEqual(config);
  });

  it("rejects invalid overlap and incomplete reranking settings", () => {
    expect(() =>
      ragConfigSchema.parse({
        embedding: {},
        chunking: { maxCharacters: 400, overlapCharacters: 400 },
        retrieval: {},
        reranking: { enabled: true, modelId: "" },
      }),
    ).toThrow();
  });
});

describe("knowledge chunking", () => {
  it("keeps paragraphs readable and applies overlap to long content", () => {
    const chunks = chunkText("a".repeat(500), {
      maxCharacters: 200,
      overlapCharacters: 40,
    });

    expect(chunks).toHaveLength(3);
    expect(chunks.every((chunk) => chunk.length <= 200)).toBe(true);
    expect(chunks[0].slice(-40)).toBe(chunks[1].slice(0, 40));
  });

  it("returns no chunks for empty documents", () => {
    expect(
      chunkText("  \n", { maxCharacters: 1_200, overlapCharacters: 160 }),
    ).toEqual([]);
  });
});
