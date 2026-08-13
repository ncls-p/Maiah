import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createChatModel: vi.fn((runtime, modelId) => ({ runtime, modelId })),
  createEmbeddingModel: vi.fn((runtime, modelId) => ({ runtime, modelId })),
  createRerankingModel: vi.fn((runtime, modelId) => ({ runtime, modelId })),
  decryptValue: vi.fn(async (value: string) => `decrypted:${value}`),
  defaultWhere: vi.fn(),
  discoverWorkspaceModels: vi.fn(),
  getAdapter: vi.fn(),
  insertValues: vi.fn(),
  isCloudTempleBaseUrl: vi.fn((value?: string | null) =>
    Boolean(value?.includes("cloud-temple")),
  ),
  onConflictDoUpdate: vi.fn(),
  providerWhere: vi.fn(),
  select: vi.fn(),
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...values) => values),
  eq: vi.fn((...values) => values),
  isNull: vi.fn((value) => value),
}));

vi.mock("@/lib/crypto", () => ({ decryptValue: mocks.decryptValue }));
vi.mock("@/modules/provider/cloud-temple-catalog", () => ({
  isCloudTempleBaseUrl: mocks.isCloudTempleBaseUrl,
}));
vi.mock("@/modules/provider/use-cases.update-model", () => ({
  discoverWorkspaceModels: mocks.discoverWorkspaceModels,
}));
vi.mock("@/server/infrastructure/providers", () => ({
  getAdapter: mocks.getAdapter,
}));
vi.mock("@/server/infrastructure/db/schema", () => ({
  aiModels: { providerId: {}, modelId: {}, enabled: {} },
  aiProviders: { id: {}, workspaceId: {}, enabled: {}, archivedAt: {} },
  appSettings: { key: {}, valueJson: {} },
}));
vi.mock("@/server/infrastructure/db", () => ({
  db: {
    select: mocks.select,
    insert: vi.fn(() => ({
      values: mocks.insertValues,
    })),
  },
}));

import {
  clearLiveCatalogCacheForTesting,
  DEFAULT_RAG_CONFIG,
  getDefaultRagConfig,
  resolveEmbeddingModel,
  resolveOcrModel,
  resolveRerankingModel,
  setDefaultRagConfig,
} from "@/modules/knowledge/rag-config";

const provider = {
  id: "11111111-1111-4111-8111-111111111111",
  workspaceId: "22222222-2222-4222-8222-222222222222",
  kind: "openai-compatible",
  name: "Cloud Temple",
  baseUrl: "https://api.cloud-temple.example/v1",
  authType: "bearer",
  encryptedApiKey: "secret",
  encryptedHeadersJson: { "X-Tenant": "tenant" },
  queryParamsJson: { region: "eu" },
  openaiCompatibleApiRoute: "chat-completions",
  enabled: true,
  archivedAt: null,
};

const adapter = {
  createChatModel: mocks.createChatModel,
  createEmbeddingModel: mocks.createEmbeddingModel,
  createRerankingModel: mocks.createRerankingModel,
};

describe("RAG runtime configuration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearLiveCatalogCacheForTesting();
    mocks.select.mockImplementation((selection?: { valueJson?: unknown }) =>
      selection?.valueJson
        ? { from: () => ({ where: mocks.defaultWhere }) }
        : {
            from: () => ({
              leftJoin: () => ({ where: mocks.providerWhere }),
            }),
          },
    );
    mocks.insertValues.mockReturnValue({
      onConflictDoUpdate: mocks.onConflictDoUpdate,
    });
    mocks.getAdapter.mockReturnValue(adapter);
    mocks.providerWhere.mockResolvedValue([
      { provider, model: { modelId: "model" } },
    ]);
    mocks.discoverWorkspaceModels.mockResolvedValue([]);
  });

  it("loads lexical defaults and persists validated platform settings", async () => {
    mocks.defaultWhere.mockResolvedValueOnce([]);
    await expect(getDefaultRagConfig()).resolves.toEqual(DEFAULT_RAG_CONFIG);

    await expect(
      setDefaultRagConfig(DEFAULT_RAG_CONFIG, "admin-user"),
    ).resolves.toEqual(DEFAULT_RAG_CONFIG);
    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "rag-defaults",
        updatedById: "admin-user",
      }),
    );
    expect(mocks.onConflictDoUpdate).toHaveBeenCalledOnce();
  });

  it("resolves embedding and OCR models with decrypted generic provider config", async () => {
    const embeddingConfig = {
      ...DEFAULT_RAG_CONFIG,
      embedding: {
        ...DEFAULT_RAG_CONFIG.embedding,
        modelId: "qwen3-embedding:4b",
      },
    };
    const embedding = await resolveEmbeddingModel(
      provider.workspaceId,
      embeddingConfig,
    );
    expect(embedding).toMatchObject({ providerId: provider.id });
    expect(mocks.createEmbeddingModel).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: "decrypted:secret",
        headers: { "X-Tenant": "decrypted:tenant" },
        queryParams: { region: "eu" },
      }),
      "qwen3-embedding:4b",
    );

    const ocr = await resolveOcrModel(provider.workspaceId, {
      ...DEFAULT_RAG_CONFIG,
      extraction: {
        ...DEFAULT_RAG_CONFIG.extraction,
        ocr: {
          ...DEFAULT_RAG_CONFIG.extraction.ocr,
          enabled: true,
          modelId: "qwen-vl",
        },
      },
    });
    expect(ocr).toMatchObject({ providerId: provider.id });
    expect(mocks.createChatModel).toHaveBeenCalledWith(
      expect.any(Object),
      "qwen-vl",
    );
  });

  it("resolves reranking and handles disabled or unavailable models", async () => {
    expect(
      await resolveEmbeddingModel(provider.workspaceId, DEFAULT_RAG_CONFIG),
    ).toBeNull();
    expect(
      await resolveRerankingModel(provider.workspaceId, DEFAULT_RAG_CONFIG),
    ).toBeNull();
    expect(
      await resolveOcrModel(provider.workspaceId, DEFAULT_RAG_CONFIG),
    ).toBeNull();

    const rerankingConfig = {
      ...DEFAULT_RAG_CONFIG,
      reranking: {
        ...DEFAULT_RAG_CONFIG.reranking,
        enabled: true,
        modelId: "nemotron-rerank",
      },
    };
    await expect(
      resolveRerankingModel(provider.workspaceId, rerankingConfig),
    ).resolves.toMatchObject({ modelId: "nemotron-rerank" });

    mocks.providerWhere.mockResolvedValueOnce([]);
    await expect(
      resolveEmbeddingModel(provider.workspaceId, {
        ...DEFAULT_RAG_CONFIG,
        embedding: { ...DEFAULT_RAG_CONFIG.embedding, modelId: "missing" },
      }),
    ).resolves.toBeNull();

    mocks.getAdapter.mockReturnValueOnce({
      createChatModel: mocks.createChatModel,
      createEmbeddingModel: mocks.createEmbeddingModel,
    });
    await expect(
      resolveRerankingModel(provider.workspaceId, rerankingConfig),
    ).resolves.toBeNull();
  });
});

describe("live-catalog resolution fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearLiveCatalogCacheForTesting();
    mocks.select.mockImplementation(() => ({
      from: () => ({
        leftJoin: () => ({ where: mocks.providerWhere }),
      }),
    }));
    mocks.getAdapter.mockReturnValue(adapter);
    mocks.discoverWorkspaceModels.mockResolvedValue([]);
  });

  const otherProvider = {
    ...provider,
    id: "33333333-3333-4333-8333-333333333333",
    name: "Generic",
    baseUrl: "https://api.generic.example/v1",
  };
  const liveConfig = {
    ...DEFAULT_RAG_CONFIG,
    embedding: {
      ...DEFAULT_RAG_CONFIG.embedding,
      modelId: "text-embedding-embeddinggemma-300m-qat",
    },
  };

  it("prefers a registered model and skips live discovery", async () => {
    mocks.providerWhere.mockResolvedValueOnce([
      { provider: otherProvider, model: { modelId: liveConfig.embedding.modelId } },
    ]);

    await expect(
      resolveEmbeddingModel(provider.workspaceId, liveConfig),
    ).resolves.toMatchObject({ providerId: otherProvider.id });
    expect(mocks.discoverWorkspaceModels).not.toHaveBeenCalled();
  });

  it("falls back to the provider whose live catalog serves the model", async () => {
    mocks.providerWhere.mockResolvedValue([
      { provider: otherProvider, model: null },
    ]);
    mocks.discoverWorkspaceModels.mockResolvedValue([
      {
        provider: { id: otherProvider.id, name: otherProvider.name },
        models: [{ modelId: liveConfig.embedding.modelId }],
        error: null,
      },
    ]);

    await expect(
      resolveEmbeddingModel(provider.workspaceId, liveConfig),
    ).resolves.toMatchObject({ providerId: otherProvider.id });
    expect(mocks.discoverWorkspaceModels).toHaveBeenCalledWith(
      provider.workspaceId,
    );
  });

  it("prefers the Cloud Temple provider when both live catalogs match", async () => {
    mocks.providerWhere.mockResolvedValue([
      { provider: otherProvider, model: null },
      { provider, model: null },
    ]);
    mocks.discoverWorkspaceModels.mockResolvedValue([
      {
        provider: { id: otherProvider.id, name: otherProvider.name },
        models: [{ modelId: liveConfig.embedding.modelId }],
        error: null,
      },
      {
        provider: { id: provider.id, name: provider.name },
        models: [{ modelId: liveConfig.embedding.modelId }],
        error: null,
      },
    ]);

    await expect(
      resolveEmbeddingModel(provider.workspaceId, liveConfig),
    ).resolves.toMatchObject({ providerId: provider.id });
  });

  it("returns null when no registered or live provider serves the model", async () => {
    mocks.providerWhere.mockResolvedValue([
      { provider: otherProvider, model: null },
    ]);
    mocks.discoverWorkspaceModels.mockResolvedValue([
      {
        provider: { id: otherProvider.id, name: otherProvider.name },
        models: [{ modelId: "some-unrelated-model" }],
        error: null,
      },
    ]);

    await expect(
      resolveEmbeddingModel(provider.workspaceId, liveConfig),
    ).resolves.toBeNull();
  });

  it("reuses the cached live catalog within the TTL", async () => {
    mocks.providerWhere.mockResolvedValue([
      { provider: otherProvider, model: null },
    ]);
    mocks.discoverWorkspaceModels.mockResolvedValue([
      {
        provider: { id: otherProvider.id, name: otherProvider.name },
        models: [{ modelId: liveConfig.embedding.modelId }],
        error: null,
      },
    ]);

    await resolveEmbeddingModel(provider.workspaceId, liveConfig);
    await resolveEmbeddingModel(provider.workspaceId, liveConfig);

    expect(mocks.discoverWorkspaceModels).toHaveBeenCalledTimes(1);
  });

  it("returns null when live discovery fails and no Cloud Temple provider exists", async () => {
    mocks.providerWhere.mockResolvedValue([
      { provider: otherProvider, model: null },
    ]);
    mocks.discoverWorkspaceModels.mockRejectedValue(new Error("boom"));

    await expect(
      resolveEmbeddingModel(provider.workspaceId, liveConfig),
    ).resolves.toBeNull();
  });
});
