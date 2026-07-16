import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────

vi.mock("@/server/domain/services/audit", () => ({
  audit: { emit: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock("@/modules/api-keys/permissions", () => ({
  getAvailableApiKeyScopes: vi
    .fn()
    .mockResolvedValue([
      { permission: "agents.chat", group: "agents", risk: "write" },
    ]),
}));

type SelectChain = {
  from: ReturnType<typeof vi.fn>;
  where: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
};

type UpdateChain = {
  set: ReturnType<typeof vi.fn>;
  where: ReturnType<typeof vi.fn>;
};

type InsertChain = {
  values: ReturnType<typeof vi.fn>;
  returning: ReturnType<typeof vi.fn>;
};

type DbMock = {
  select: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
};

type DbModule = {
  db: DbMock;
  _sc: SelectChain;
  _uc: UpdateChain;
  _ic: InsertChain;
};

vi.mock("@/server/infrastructure/db", () => {
  const sc: SelectChain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
  };
  const uc: UpdateChain = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(undefined),
  };
  const ic: InsertChain = {
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([]),
  };
  return {
    db: {
      select: vi.fn(),
      update: vi.fn(),
      insert: vi.fn(),
    },
    _sc: sc,
    _uc: uc,
    _ic: ic,
  };
});

import * as _dbModule from "@/server/infrastructure/db";
const dbModule = _dbModule as unknown as DbModule;
import * as apiKeyPermissions from "@/modules/api-keys/permissions";
import {
  createWorkspaceApiKey,
  listWorkspaceApiKeys,
  revokeWorkspaceApiKey,
  verifyWorkspaceApiKey,
} from "@/modules/api-keys/use-cases";

function reset() {
  dbModule._sc.from.mockReturnThis();
  dbModule._sc.where.mockReturnThis();
  dbModule._sc.limit.mockResolvedValue([]);
  dbModule._uc.set.mockReturnThis();
  dbModule._uc.where.mockResolvedValue(undefined);
  dbModule._ic.values.mockReturnThis();
  dbModule._ic.returning.mockResolvedValue([]);
}

const fakeKey = {
  id: "key-1",
  workspaceId: "ws-1",
  name: "My Key",
  keyPrefix: "ahub_abc123",
  createdById: "user-1",
  lastUsedAt: null,
  expiresAt: null,
  revokedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  keyHash: "hash",
  scopesJson: ["agents.chat"],
};

beforeEach(() => {
  vi.clearAllMocks();
  reset();
  dbModule.db.select.mockReturnValue(dbModule._sc);
  dbModule.db.update.mockReturnValue(dbModule._uc);
  dbModule.db.insert.mockReturnValue(dbModule._ic);
});

describe("createWorkspaceApiKey", () => {
  it("inserts a new API key and returns rawKey + safeKey", async () => {
    dbModule._ic.returning.mockResolvedValueOnce([fakeKey]);

    const result = await createWorkspaceApiKey({
      workspaceId: "ws-1",
      userId: "user-1",
      name: "My Key",
      scopes: ["agents.chat"],
    });

    expect(result.rawKey).toMatch(/^ahub_/);
    expect(result.apiKey.name).toBe("My Key");
    expect(result.apiKey).not.toHaveProperty("keyHash");
  });

  it("stores expiry when provided", async () => {
    const expiresAt = new Date(Date.now() + 86400000);
    dbModule._ic.returning.mockResolvedValueOnce([{ ...fakeKey, expiresAt }]);

    const result = await createWorkspaceApiKey({
      workspaceId: "ws-1",
      userId: "user-1",
      name: "Expiring Key",
      expiresAt,
      scopes: ["agents.chat"],
    });

    expect(result.apiKey.expiresAt).toEqual(expiresAt);
  });

  it("rejects an empty scope set", async () => {
    await expect(
      createWorkspaceApiKey({
        workspaceId: "ws-1",
        userId: "user-1",
        name: "No access",
        scopes: [],
      }),
    ).rejects.toThrow("At least one API token scope");
    expect(dbModule.db.insert).not.toHaveBeenCalled();
  });

  it("rejects unknown scopes", async () => {
    await expect(
      createWorkspaceApiKey({
        workspaceId: "ws-1",
        userId: "user-1",
        name: "Unknown access",
        scopes: ["unknown.permission"],
      }),
    ).rejects.toThrow("Unknown API token scopes");
    expect(dbModule.db.insert).not.toHaveBeenCalled();
  });

  it("rejects scopes beyond the caller's effective permissions", async () => {
    vi.mocked(apiKeyPermissions.getAvailableApiKeyScopes).mockResolvedValueOnce(
      [],
    );

    await expect(
      createWorkspaceApiKey({
        workspaceId: "ws-1",
        userId: "user-1",
        name: "Escalation attempt",
        scopes: ["agents.chat"],
      }),
    ).rejects.toThrow("exceed current permissions");
    expect(dbModule.db.insert).not.toHaveBeenCalled();
  });
});

describe("listWorkspaceApiKeys", () => {
  it("returns mapped safe keys", async () => {
    dbModule._sc.where.mockResolvedValueOnce([fakeKey]);

    const keys = await listWorkspaceApiKeys("ws-1");

    expect(keys).toHaveLength(1);
    expect(keys[0].name).toBe("My Key");
    expect(keys[0]).not.toHaveProperty("keyHash");
  });

  it("returns empty array when no keys", async () => {
    dbModule._sc.where.mockResolvedValueOnce([]);

    const keys = await listWorkspaceApiKeys("ws-1");
    expect(keys).toEqual([]);
  });

  it("can restrict the list to keys created by one user", async () => {
    dbModule._sc.where.mockResolvedValueOnce([fakeKey]);

    const keys = await listWorkspaceApiKeys("ws-1", {
      createdById: "user-1",
    });

    expect(keys).toHaveLength(1);
    expect(dbModule._sc.where).toHaveBeenCalledOnce();
  });
});

describe("revokeWorkspaceApiKey", () => {
  it("throws when key not found", async () => {
    dbModule._sc.limit.mockResolvedValueOnce([]);

    await expect(
      revokeWorkspaceApiKey({
        keyId: "key-1",
        workspaceId: "ws-1",
        userId: "user-1",
      }),
    ).rejects.toThrow("API key not found");
  });

  it("updates revokedAt when key found", async () => {
    dbModule._sc.limit.mockResolvedValueOnce([fakeKey]);

    await expect(
      revokeWorkspaceApiKey({
        keyId: "key-1",
        workspaceId: "ws-1",
        userId: "user-1",
      }),
    ).resolves.toBeUndefined();

    expect(dbModule.db.update).toHaveBeenCalled();
  });

  it("can restrict revocation to a key created by one user", async () => {
    dbModule._sc.limit.mockResolvedValueOnce([fakeKey]);

    await revokeWorkspaceApiKey({
      keyId: "key-1",
      workspaceId: "ws-1",
      userId: "user-1",
      createdById: "user-1",
    });

    expect(dbModule.db.update).toHaveBeenCalledOnce();
  });
});

describe("verifyWorkspaceApiKey", () => {
  it("returns null for keys not starting with ahub_", async () => {
    const result = await verifyWorkspaceApiKey("invalid_key");
    expect(result).toBeNull();
    expect(dbModule.db.select).not.toHaveBeenCalled();
  });

  it("returns null when key hash not found in DB", async () => {
    dbModule._sc.limit.mockResolvedValueOnce([]);

    const result = await verifyWorkspaceApiKey("ahub_abc123456789012345678");
    expect(result).toBeNull();
  });

  it("returns null for expired keys", async () => {
    dbModule._sc.limit.mockResolvedValueOnce([
      { ...fakeKey, expiresAt: new Date(Date.now() - 1000) },
    ]);

    const result = await verifyWorkspaceApiKey("ahub_abc123456789012345678");
    expect(result).toBeNull();
  });

  it("returns key info for valid non-expired key", async () => {
    dbModule._sc.limit.mockResolvedValueOnce([
      { ...fakeKey, expiresAt: new Date(Date.now() + 100000) },
    ]);

    const result = await verifyWorkspaceApiKey("ahub_abc123456789012345678");
    expect(result).not.toBeNull();
    expect(result?.workspaceId).toBe("ws-1");
  });

  it("returns key info for key with no expiry", async () => {
    dbModule._sc.limit.mockResolvedValueOnce([fakeKey]);

    const result = await verifyWorkspaceApiKey("ahub_abc123456789012345678");
    expect(result).not.toBeNull();
    expect(result?.id).toBe("key-1");
  });
});
