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
  resolveEmbeddingModel,
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
      {
        provider: otherProvider,
        model: { modelId: liveConfig.embedding.modelId },
      },
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

