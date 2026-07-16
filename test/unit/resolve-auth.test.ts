import { describe, expect, it, vi } from "vitest";
import type { AuthContext } from "@/modules/auth/resolve-auth";

const createMockSession = () => ({
  session: {
    id: "session-1",
    createdAt: new Date(),
    updatedAt: new Date(),
    userId: "user-123",
    expiresAt: new Date(Date.now() + 86400000),
    token: "tok",
  },
  user: {
    id: "user-123",
    email: "user@test.com",
    name: "Test User",
    role: "admin",
    image: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    emailVerified: true,
    banned: null,
    banReason: null,
    banExpires: null,
  },
});

vi.mock("@/modules/auth/session", () => ({
  getSession: vi.fn(),
}));

vi.mock("@/modules/api-keys/use-cases", () => ({
  verifyWorkspaceApiKey: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(),
}));

import {
  resolveAuthContext,
  getActorUserId,
} from "@/modules/auth/resolve-auth";
import * as sessionMod from "@/modules/auth/session";
import * as apiKeyMod from "@/modules/api-keys/use-cases";
import * as headersMod from "next/headers";

describe("resolveAuthContext", () => {
  it("returns user context when session exists", async () => {
    vi.mocked(sessionMod.getSession).mockResolvedValue(
      createMockSession() as ReturnType<
        typeof sessionMod.getSession
      > extends Promise<infer T>
        ? T
        : never,
    );
    vi.mocked(headersMod.headers).mockResolvedValue(new Headers());

    const ctx = await resolveAuthContext();
    expect(ctx).toEqual({
      type: "user",
      userId: "user-123",
      email: "user@test.com",
      name: "Test User",
      role: "admin",
    });
  });

  it("returns null when no session and no auth header", async () => {
    vi.mocked(sessionMod.getSession).mockResolvedValue(null);
    vi.mocked(headersMod.headers).mockResolvedValue(new Headers());

    const ctx = await resolveAuthContext();
    expect(ctx).toBeNull();
  });

  it("returns api_key context with valid Bearer token", async () => {
    vi.mocked(sessionMod.getSession).mockResolvedValue(null);
    const hdrs = new Headers();
    hdrs.set("authorization", "Bearer my-api-key");
    vi.mocked(headersMod.headers).mockResolvedValue(hdrs);
    vi.mocked(apiKeyMod.verifyWorkspaceApiKey).mockResolvedValue({
      id: "key-123",
      workspaceId: "ws-123",
      createdById: "user-456",
      name: "test-key",
      scopes: ["agents.chat"],
    });

    const ctx = await resolveAuthContext();
    expect(ctx).toEqual({
      type: "api_key",
      apiKeyId: "key-123",
      workspaceId: "ws-123",
      userId: "user-456",
      scopes: ["agents.chat"],
    });
  });

  it("uses an explicit Bearer token instead of an ambient browser session", async () => {
    vi.mocked(sessionMod.getSession).mockResolvedValue(
      createMockSession() as never,
    );
    vi.mocked(sessionMod.getSession).mockClear();
    const hdrs = new Headers({ authorization: "Bearer my-api-key" });
    vi.mocked(headersMod.headers).mockResolvedValue(hdrs);
    vi.mocked(apiKeyMod.verifyWorkspaceApiKey).mockResolvedValue({
      id: "key-123",
      workspaceId: "ws-123",
      createdById: "user-456",
      name: "test-key",
      scopes: ["agents.chat"],
    });

    const ctx = await resolveAuthContext();

    expect(ctx?.type).toBe("api_key");
    expect(sessionMod.getSession).not.toHaveBeenCalled();
  });

  it("returns null when Bearer token is empty", async () => {
    vi.mocked(sessionMod.getSession).mockResolvedValue(null);
    const hdrs = new Headers();
    hdrs.set("authorization", "Bearer ");
    vi.mocked(headersMod.headers).mockResolvedValue(hdrs);

    const ctx = await resolveAuthContext();
    expect(ctx).toBeNull();
  });

  it("returns null when auth header is not Bearer", async () => {
    vi.mocked(sessionMod.getSession).mockResolvedValue(null);
    const hdrs = new Headers();
    hdrs.set("authorization", "Basic abc123");
    vi.mocked(headersMod.headers).mockResolvedValue(hdrs);

    const ctx = await resolveAuthContext();
    expect(ctx).toBeNull();
  });

  it("returns null when API key verification fails", async () => {
    vi.mocked(sessionMod.getSession).mockResolvedValue(null);
    const hdrs = new Headers();
    hdrs.set("authorization", "Bearer invalid-key");
    vi.mocked(headersMod.headers).mockResolvedValue(hdrs);
    vi.mocked(apiKeyMod.verifyWorkspaceApiKey).mockResolvedValue(null);

    const ctx = await resolveAuthContext();
    expect(ctx).toBeNull();
  });
});

describe("getActorUserId", () => {
  it("returns userId for user context", () => {
    const ctx: AuthContext = {
      type: "user",
      userId: "user-123",
      email: "test@test.com",
      name: "Test",
      role: "admin",
    };
    expect(getActorUserId(ctx)).toBe("user-123");
  });

  it("returns userId for api_key context", () => {
    const ctx: AuthContext = {
      type: "api_key",
      apiKeyId: "key-123",
      workspaceId: "ws-123",
      userId: "user-456",
      scopes: ["agents.chat"],
    };
    expect(getActorUserId(ctx)).toBe("user-456");
  });
});
