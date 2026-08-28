import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  isPlatformAdminSession: vi.fn(),
  requireAdminApiSession: vi.fn(),
  getRegistrationSetting: vi.fn(),
  setRegistrationEnabled: vi.fn(),
  logHandledError: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logHandledError: mocks.logHandledError,
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/modules/auth/session", () => ({
  getSession: mocks.getSession,
}));

vi.mock("@/modules/admin/auth", () => ({
  isPlatformAdminSession: mocks.isPlatformAdminSession,
  requireAdminApiSession: mocks.requireAdminApiSession,
}));

vi.mock("@/modules/admin/use-cases", () => ({
  getRegistrationSetting: mocks.getRegistrationSetting,
  setRegistrationEnabled: mocks.setRegistrationEnabled,
}));

vi.mock("@/lib/route-handler", () => ({
  handleRoute: vi.fn(),
  requireWorkspacePermissionAsync: vi.fn(),
}));

import { GET } from "@/app/api/admin/settings/route";

const fullSetting = {
  registrationEnabled: false,
  userCount: 42,
  canPublicSignUp: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getRegistrationSetting.mockResolvedValue(fullSetting);
});

describe("GET /api/admin/settings", () => {
  it("exposes the full payload to an admin session", async () => {
    mocks.getSession.mockResolvedValue({
      user: { id: "1", email: "a@b.c", name: "Admin", role: "admin" },
    });
    mocks.isPlatformAdminSession.mockResolvedValue(true);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(fullSetting);
  });

  it("never exposes userCount to anonymous callers", async () => {
    mocks.getSession.mockResolvedValue(null);
    mocks.isPlatformAdminSession.mockResolvedValue(false);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      registrationEnabled: false,
      canPublicSignUp: false,
    });
    expect(body).not.toHaveProperty("userCount");
  });

  it("never exposes userCount to a non-admin session", async () => {
    mocks.getSession.mockResolvedValue({
      user: { id: "2", email: "u@b.c", name: "User", role: "user" },
    });
    mocks.isPlatformAdminSession.mockResolvedValue(false);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).not.toHaveProperty("userCount");
  });

  it("logs and returns a generic 500 on failure", async () => {
    mocks.getSession.mockResolvedValue(null);
    mocks.getRegistrationSetting.mockRejectedValue(
      new Error('relation "app_settings" does not exist'),
    );

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: "Internal server error" });
    expect(JSON.stringify(body)).not.toContain("does not exist");
    expect(mocks.logHandledError).toHaveBeenCalledOnce();
  });
});
