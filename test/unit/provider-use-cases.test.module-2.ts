import { describe,expect,it } from "vitest";

import {
archiveProvider,
createProvider,
getProviderById,
listProviders,
refreshProviderModels,
updateProvider
} from "@/modules/provider/use-cases";
import { dbModule,fakeModel,fakeProvider } from "./provider-use-cases.test.mock-adapter";


// ─── createProvider ───────────────────────────────────────────────────

describe("createProvider", () => {
  it("inserts provider without encryption when no API key", async () => {
    dbModule._c.returning.mockResolvedValueOnce([fakeProvider]);
    const { encryptValue } = await import("@/lib/crypto");

    const result = await createProvider({
      workspaceId: "ws-1",
      userId: "user-1",
      kind: "openai-compatible",
      name: "Test",
      authType: "bearer",
    });

    expect(dbModule.db.insert).toHaveBeenCalled();
    expect(encryptValue).not.toHaveBeenCalled();
    expect(result).toEqual(fakeProvider);
  });

  it("encrypts API key when provided", async () => {
    dbModule._c.returning.mockResolvedValueOnce([fakeProvider]);
    const { encryptValue } = await import("@/lib/crypto");

    await createProvider({
      workspaceId: "ws-1",
      userId: "user-1",
      kind: "openai-compatible",
      name: "Test",
      authType: "bearer",
      apiKey: "sk-secret",
    });

    expect(encryptValue).toHaveBeenCalledWith("sk-secret");
  });

  it("encrypts each header value", async () => {
    dbModule._c.returning.mockResolvedValueOnce([fakeProvider]);
    const { encryptValue } = await import("@/lib/crypto");

    await createProvider({
      workspaceId: "ws-1",
      userId: "user-1",
      kind: "openai-compatible",
      name: "Test",
      authType: "bearer",
      headersJson: { "X-Custom": "secret-header" },
    });

    expect(encryptValue).toHaveBeenCalledWith("secret-header");
  });

  it("uses the Responses API for new providers by default", async () => {
    dbModule._c.returning.mockResolvedValueOnce([fakeProvider]);

    await createProvider({
      workspaceId: "ws-1",
      userId: "user-1",
      kind: "openai-compatible",
      name: "Test",
      authType: "bearer",
    });

    expect(dbModule._c.values).toHaveBeenCalledWith(
      expect.objectContaining({ openaiCompatibleApiRoute: "responses" }),
    );
  });
});

describe("registered provider model synchronization", () => {
  it("updates metadata only for models that were already added", async () => {
    dbModule._c.limit.mockResolvedValueOnce([fakeProvider]);
    dbModule._c.orderBy.mockResolvedValueOnce([
      { ...fakeModel, modelId: "model-1" },
    ]);

    const result = await refreshProviderModels("prov-1", "ws-1");

    expect(result).toEqual({ status: "healthy", imported: 1 });
    expect(dbModule._c.onConflictDoUpdate).toHaveBeenCalledOnce();
  });

  it("does not add newly discovered models", async () => {
    dbModule._c.limit.mockResolvedValueOnce([fakeProvider]);
    dbModule._c.orderBy.mockResolvedValueOnce([]);

    const result = await refreshProviderModels("prov-1", "ws-1");

    expect(result).toEqual({ status: "healthy", imported: 0 });
    expect(dbModule.db.insert).not.toHaveBeenCalled();
  });
});

// ─── getProviderById ──────────────────────────────────────────────────

describe("getProviderById", () => {
  it("returns null when not found", async () => {
    const result = await getProviderById("nonexistent", "ws-1");
    expect(result).toBeNull();
  });

  it("returns provider when found", async () => {
    dbModule._c.limit.mockResolvedValueOnce([fakeProvider]);
    const result = await getProviderById("prov-1", "ws-1");
    expect(result).toEqual(fakeProvider);
  });
});

// ─── listProviders ────────────────────────────────────────────────────

describe("listProviders", () => {
  it("returns providers ordered by createdAt desc", async () => {
    dbModule._c.orderBy.mockResolvedValueOnce([fakeProvider]);

    const result = await listProviders("ws-1");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("prov-1");
  });

  it("returns empty array when no providers", async () => {
    dbModule._c.orderBy.mockResolvedValueOnce([]);

    const result = await listProviders("ws-1");
    expect(result).toHaveLength(0);
  });
});

// ─── updateProvider ───────────────────────────────────────────────────

describe("updateProvider", () => {
  it("throws when provider not found", async () => {
    await expect(
      updateProvider({
        providerId: "prov-1",
        workspaceId: "ws-1",
        userId: "user-1",
      }),
    ).rejects.toThrow("Provider not found");
  });

  it("updates provider fields when found", async () => {
    dbModule._c.limit.mockResolvedValueOnce([fakeProvider]);

    await updateProvider({
      providerId: "prov-1",
      workspaceId: "ws-1",
      userId: "user-1",
      name: "New Name",
      enabled: false,
    });

    expect(dbModule.db.update).toHaveBeenCalled();
  });

  it("encrypts new API key when provided", async () => {
    dbModule._c.limit.mockResolvedValueOnce([fakeProvider]);
    const { encryptValue } = await import("@/lib/crypto");

    await updateProvider({
      providerId: "prov-1",
      workspaceId: "ws-1",
      userId: "user-1",
      apiKey: "new-sk-secret",
    });

    expect(encryptValue).toHaveBeenCalledWith("new-sk-secret");
  });

  it("encrypts new headers when provided", async () => {
    dbModule._c.limit.mockResolvedValueOnce([fakeProvider]);
    const { encryptValue } = await import("@/lib/crypto");

    await updateProvider({
      providerId: "prov-1",
      workspaceId: "ws-1",
      userId: "user-1",
      headersJson: { "X-Header": "header-value" },
    });

    expect(encryptValue).toHaveBeenCalledWith("header-value");
  });

  it("updates the OpenAI-compatible API route", async () => {
    dbModule._c.limit.mockResolvedValueOnce([fakeProvider]);

    await updateProvider({
      providerId: "prov-1",
      workspaceId: "ws-1",
      userId: "user-1",
      openaiCompatibleApiRoute: "responses",
    });

    expect(dbModule._c.set).toHaveBeenCalledWith(
      expect.objectContaining({ openaiCompatibleApiRoute: "responses" }),
    );
  });
});

// ─── archiveProvider ──────────────────────────────────────────────────

describe("archiveProvider", () => {
  it("throws when provider not found", async () => {
    await expect(archiveProvider("prov-1", "ws-1", "user-1")).rejects.toThrow(
      "Provider not found",
    );
  });

  it("sets archivedAt when found", async () => {
    dbModule._c.limit.mockResolvedValueOnce([fakeProvider]);

    await archiveProvider("prov-1", "ws-1", "user-1");

    expect(dbModule.db.update).toHaveBeenCalled();
  });
});
