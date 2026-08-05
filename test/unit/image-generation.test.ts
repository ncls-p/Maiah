import { beforeEach,describe,expect,it,vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rows: [] as Array<{
    model: Record<string, unknown>;
    provider: Record<string, unknown>;
  }>,
  insertValues: vi.fn().mockResolvedValue(undefined),
  generateImage: vi.fn(),
  decryptValue: vi.fn(),
  createChatImageAttachment: vi.fn(),
  getUsageImpactSetting: vi.fn(),
  checkPermission: vi.fn(),
  createImageModel: vi.fn(),
}));

vi.mock("ai", () => ({
  generateImage: mocks.generateImage,
}));

vi.mock("@/lib/crypto", () => ({
  decryptValue: mocks.decryptValue,
}));

vi.mock("@/modules/chat/attachments", () => ({
  createChatImageAttachment: mocks.createChatImageAttachment,
}));

vi.mock("@/modules/provider/usage-impact-settings", () => ({
  getUsageImpactSetting: mocks.getUsageImpactSetting,
}));

vi.mock("@/server/domain/services/authorization", () => ({
  authorization: { checkPermission: mocks.checkPermission },
}));

vi.mock("@/server/infrastructure/providers", () => ({
  getAdapter: vi.fn(() => ({ createImageModel: mocks.createImageModel })),
}));

vi.mock("@/server/infrastructure/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        innerJoin: vi.fn(() => ({
          where: vi.fn(async () => mocks.rows),
        })),
      })),
    })),
    insert: vi.fn(() => ({ values: mocks.insertValues })),
  },
}));

import { generateWorkspaceImage } from "@/modules/provider/image-generation";
import { getAdapter } from "@/server/infrastructure/providers";

function imageRow(overrides?: { model?: Record<string, unknown>; provider?: Record<string, unknown> }) {
  return {
    model: {
      id: "model-db-1",
      providerId: "provider-1",
      modelId: "image-model",
      displayName: "Image model",
      capabilitiesJson: { imageGeneration: true },
      imageGenerationConfigJson: {
        enabled: true,
        isDefault: true,
        defaultSize: "1024x1024",
        allowedSizes: ["1024x1024", "512x512"],
        costPerImage: 0.02,
        energyKwhPerImage: 0.1,
        co2GramsPerImage: 4,
        currency: "USD",
      },
      enabled: true,
      ...overrides?.model,
    },
    provider: {
      id: "provider-1",
      workspaceId: "workspace-1",
      kind: "openai-compatible",
      name: "Cloud Temple",
      baseUrl: "https://example.test/v1",
      authType: "bearer",
      encryptedApiKey: "encrypted-key",
      encryptedHeadersJson: { "x-tenant": "encrypted-header" },
      queryParamsJson: { region: "fr" },
      openaiCompatibleApiRoute: "responses",
      enabled: true,
      archivedAt: null,
      ...overrides?.provider,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rows = [imageRow()];
  mocks.decryptValue.mockResolvedValueOnce("api-key").mockResolvedValueOnce("tenant");
  mocks.checkPermission.mockResolvedValue({ granted: true });
  mocks.createImageModel.mockReturnValue({ specificationVersion: "v4" });
  mocks.generateImage.mockResolvedValue({
    image: { uint8Array: new Uint8Array([1, 2, 3]) },
  });
  mocks.createChatImageAttachment.mockResolvedValue({
    id: "attachment-1",
    name: "generated.png",
  });
  mocks.getUsageImpactSetting.mockResolvedValue({
    enabled: true,
    co2GramsPerKwh: 50,
  });
});

describe("generateWorkspaceImage", () => {
  it("generates, stores, and measures an accessible image", async () => {
    const result = await generateWorkspaceImage({
      workspaceId: "workspace-1",
      userId: "user-1",
      conversationId: "conversation-1",
      prompt: "A quiet forest",
      size: "512x512",
    });

    expect(mocks.createImageModel).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: "api-key",
        headers: { "x-tenant": "tenant" },
        queryParams: { region: "fr" },
      }),
      "image-model",
    );
    expect(mocks.generateImage).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "A quiet forest",
        size: "512x512",
        n: 1,
      }),
    );
    expect(mocks.createChatImageAttachment).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-1",
        userId: "user-1",
        bytes: new Uint8Array([1, 2, 3]),
      }),
    );
    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "image_generation",
        costUsd: "0.02",
        status: "success",
      }),
    );
    expect(result).toMatchObject({
      kind: "generated_image",
      provider: "Cloud Temple",
      model: "Image model",
      size: "512x512",
      impact: { cost: 0.02, energyKwh: 0.1, co2Grams: 4 },
    });
  });

  it("uses the configured default size and supports providers without secrets", async () => {
    mocks.rows = [
      imageRow({
        model: { displayName: null },
        provider: {
          encryptedApiKey: null,
          encryptedHeadersJson: null,
          queryParamsJson: null,
        },
      }),
    ];

    const result = await generateWorkspaceImage({
      workspaceId: "workspace-1",
      userId: "user-1",
      prompt: "A lake",
    });

    expect(mocks.createImageModel).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: undefined,
        headers: undefined,
        queryParams: undefined,
      }),
      "image-model",
    );
    expect(result).toMatchObject({
      model: "image-model",
      size: "1024x1024",
    });
  });

  it("fails when no configured image model exists", async () => {
    mocks.rows = [];

    await expect(
      generateWorkspaceImage({
        workspaceId: "workspace-1",
        userId: "user-1",
        prompt: "A lake",
      }),
    ).rejects.toThrow("No image model is configured or accessible");
  });

  it("skips image models the user cannot invoke", async () => {
    mocks.checkPermission.mockResolvedValue({ granted: false });

    await expect(
      generateWorkspaceImage({
        workspaceId: "workspace-1",
        userId: "user-1",
        prompt: "A lake",
      }),
    ).rejects.toThrow("No image model is configured or accessible");
  });

  it("fails when the provider cannot generate images", async () => {
    vi.mocked(getAdapter).mockReturnValueOnce({} as never);

    await expect(
      generateWorkspaceImage({
        workspaceId: "workspace-1",
        userId: "user-1",
        prompt: "A lake",
      }),
    ).rejects.toThrow("does not support image generation");
  });

  it("rejects a size that is not allowed by the model", async () => {
    await expect(
      generateWorkspaceImage({
        workspaceId: "workspace-1",
        userId: "user-1",
        prompt: "A lake",
        size: "2048x2048",
      }),
    ).rejects.toThrow("Allowed sizes: 1024x1024, 512x512");
  });

  it("hides impact values when global display is disabled", async () => {
    mocks.getUsageImpactSetting.mockResolvedValue({
      enabled: false,
      co2GramsPerKwh: null,
    });

    const result = await generateWorkspaceImage({
      workspaceId: "workspace-1",
      userId: "user-1",
      prompt: "A lake",
    });

    expect(result.impact).toEqual({
      cost: null,
      currency: "USD",
      energyKwh: null,
      co2Grams: null,
    });
    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        costUsd: null,
        metadataJson: expect.objectContaining({
          cost: 0.02,
          energyKwh: 0.1,
          co2Grams: 4,
        }),
      }),
    );
  });
});
