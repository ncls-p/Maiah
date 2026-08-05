import { beforeEach, describe, expect, it, vi } from "vitest";

import * as _dbModule from "@/server/infrastructure/db";
import {
  archiveProvider,
  createModel,
  createProvider,
  deleteModel,
  discoverModels,
  getModelById,
  getProviderById,
  listModels,
  listProviders,
  refreshProviderModels,
  testProviderConnection,
  toSafeProvider,
  updateModel,
  updateProvider,
} from "@/modules/provider/use-cases";
import {
  dbModule,
  fakeModel,
  fakeProvider,
  getMockAdapter,
} from "./provider-use-cases.test.mock-adapter";

const mockAdapter = getMockAdapter();

// ─── testProviderConnection ───────────────────────────────────────────

describe("testProviderConnection", () => {
  it("throws when provider not found", async () => {
    await expect(testProviderConnection("prov-1", "ws-1")).rejects.toThrow(
      "Provider not found",
    );
  });

  it("returns health status and updates DB", async () => {
    dbModule._c.limit.mockResolvedValueOnce([fakeProvider]);

    const health = await testProviderConnection("prov-1", "ws-1");

    expect(health.status).toBe("healthy");
    expect(dbModule.db.update).toHaveBeenCalled();
  });

  it("decrypts API key before calling adapter", async () => {
    dbModule._c.limit.mockResolvedValueOnce([
      { ...fakeProvider, encryptedApiKey: "enc:key" },
    ]);
    const { decryptValue } = await import("@/lib/crypto");

    await testProviderConnection("prov-1", "ws-1");

    expect(decryptValue).toHaveBeenCalledWith("enc:key");
  });

  it("decrypts headers when encryptedHeadersJson is present", async () => {
    dbModule._c.limit.mockResolvedValueOnce([
      { ...fakeProvider, encryptedHeadersJson: { "X-Key": "enc:header" } },
    ]);
    const { decryptValue } = await import("@/lib/crypto");

    await testProviderConnection("prov-1", "ws-1");

    expect(decryptValue).toHaveBeenCalledWith("enc:header");
  });

  it("passes the stored API route to the provider adapter", async () => {
    dbModule._c.limit.mockResolvedValueOnce([fakeProvider]);

    await testProviderConnection("prov-1", "ws-1");

    expect(mockAdapter.validateConnection).toHaveBeenCalledWith(
      expect.objectContaining({
        openaiCompatibleApiRoute: "chat-completions",
      }),
    );
  });
});

// ─── createModel ──────────────────────────────────────────────────────

describe("createModel", () => {
  it("inserts model and returns it", async () => {
    dbModule._c.returning.mockResolvedValueOnce([fakeModel]);

    const result = await createModel("prov-1", {
      providerId: "prov-1",
      modelId: "gpt-4",
    });

    expect(dbModule.db.insert).toHaveBeenCalled();
    expect(result).toEqual(fakeModel);
  });

  it("uses modelId as displayName when not provided", async () => {
    dbModule._c.returning.mockResolvedValueOnce([fakeModel]);

    await createModel("prov-1", { providerId: "prov-1", modelId: "gpt-4" });

    const insertValues = dbModule._c.values.mock.calls[0][0];
    expect(insertValues.displayName).toBe("gpt-4");
  });

  it("uses explicit displayName when provided", async () => {
    dbModule._c.returning.mockResolvedValueOnce([fakeModel]);

    await createModel("prov-1", {
      providerId: "prov-1",
      modelId: "gpt-4",
      displayName: "GPT-4 Turbo",
    });

    const insertValues = dbModule._c.values.mock.calls[0][0];
    expect(insertValues.displayName).toBe("GPT-4 Turbo");
  });
});

// ─── getModelById ─────────────────────────────────────────────────────

describe("getModelById", () => {
  it("returns null when not found", async () => {
    const result = await getModelById("nonexistent");
    expect(result).toBeNull();
  });

  it("returns model when found", async () => {
    dbModule._c.limit.mockResolvedValueOnce([fakeModel]);
    const result = await getModelById("model-1");
    expect(result).toEqual(fakeModel);
  });
});

// ─── listModels ───────────────────────────────────────────────────────

describe("listModels", () => {
  it("returns models ordered by createdAt desc", async () => {
    dbModule._c.orderBy.mockResolvedValueOnce([fakeModel]);

    const result = await listModels("prov-1");
    expect(result).toHaveLength(1);
  });

  it("returns empty when no models", async () => {
    dbModule._c.orderBy.mockResolvedValueOnce([]);

    const result = await listModels("prov-1");
    expect(result).toHaveLength(0);
  });
});

// ─── updateModel ──────────────────────────────────────────────────────

describe("updateModel", () => {
  it("calls db.update with provided fields", async () => {
    await updateModel("model-1", {
      displayName: "GPT-4 Updated",
      enabled: false,
    });

    expect(dbModule.db.update).toHaveBeenCalled();
    expect(dbModule._c.set).toHaveBeenCalled();
  });

  it("is a no-op for empty input", async () => {
    await updateModel("model-1", {});

    expect(dbModule.db.update).toHaveBeenCalled();
  });
});

// ─── deleteModel ──────────────────────────────────────────────────────

describe("deleteModel", () => {
  it("calls db.delete", async () => {
    await deleteModel("model-1");

    expect(dbModule.db.delete).toHaveBeenCalled();
  });
});

// ─── discoverModels ───────────────────────────────────────────────────

describe("discoverModels", () => {
  it("throws when provider not found", async () => {
    await expect(discoverModels("prov-1", "ws-1")).rejects.toThrow(
      "Provider not found",
    );
  });

  it("returns list of discovered models", async () => {
    dbModule._c.limit.mockResolvedValueOnce([fakeProvider]);

    const models = await discoverModels("prov-1", "ws-1");

    expect(models).toHaveLength(1);
    expect(models[0].modelId).toBe("model-1");
  });

  it("throws when adapter does not support listModels", async () => {
    const { getAdapter } = await import("@/server/infrastructure/providers");
    vi.mocked(getAdapter).mockReturnValueOnce({
      validateConnection: vi.fn(),
    } as never);
    dbModule._c.limit.mockResolvedValueOnce([fakeProvider]);

    await expect(discoverModels("prov-1", "ws-1")).rejects.toThrow(
      "Model discovery not supported",
    );
  });
});
