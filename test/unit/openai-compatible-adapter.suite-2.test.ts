import { embed,rerank } from "ai";
import { afterEach,describe,expect,it,vi } from "vitest";

import { openaiCompatibleAdapter } from "@/server/infrastructure/providers/openai-compatible-adapter";

describe("openaiCompatibleAdapter RAG models", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates embeddings through the OpenAI-compatible endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        data: [{ index: 0, embedding: [0.1, 0.2, 0.3] }],
        usage: { prompt_tokens: 3, total_tokens: 3 },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const model = openaiCompatibleAdapter.createEmbeddingModel(
      {
        kind: "openai-compatible",
        name: "Cloud Temple",
        baseUrl: "https://embedding.example/v1",
        authType: "bearer",
        apiKey: "secret",
      },
      "custom-embedding",
    );

    await expect(embed({ model, value: "hello" })).resolves.toMatchObject({
      embedding: [0.1, 0.2, 0.3],
    });
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("https://embedding.example/v1/embeddings");
  });

  it("normalizes compatible reranking responses through AI SDK", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          results: [
            { index: 1, relevance_score: 0.9 },
            { index: 0, relevance_score: 0.2 },
          ],
        }),
      ),
    );
    const model = openaiCompatibleAdapter.createRerankingModel?.(
      {
        kind: "openai-compatible",
        name: "Cloud Temple",
        baseUrl: "https://rerank.example/v1",
        authType: "bearer",
        apiKey: "secret",
      },
      "custom-reranker",
    );
    expect(model).toBeDefined();

    const result = await rerank({
      model: model!,
      query: "relevant",
      documents: ["first", "second"],
    });
    expect(result.rerankedDocuments).toEqual(["second", "first"]);
    expect(result.ranking[0]).toMatchObject({ originalIndex: 1, score: 0.9 });
  });
});
