import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ signInSocial: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: async () => ({ allowed: true }),
  rateLimitExceededResponse: vi.fn(),
}));
vi.mock("@/modules/auth/microsoft/settings", () => ({
  readMicrosoftConfig: async () => ({
    enabled: true,
    approved: true,
    loginOrigin: "https://maiah.deodis.com",
    revision: "test",
  }),
}));
vi.mock("@/modules/auth/microsoft/provider", () => ({
  createMicrosoftAuth: async () => ({
    api: { signInSocial: mocks.signInSocial },
  }),
}));
import { GET } from "@/app/api/auth/microsoft/start/route";
const path =
  "/api/auth/microsoft/start?organizationId=11111111-1111-4111-8111-111111111111&locale=fr";
beforeEach(() => {
  mocks.signInSocial
    .mockReset()
    .mockResolvedValue(
      Response.json({
        url: "https://login.microsoftonline.com/test/authorize",
      }),
    );
});
describe("Microsoft start behind TLS termination", () => {
  it("starts OAuth on the canonical public Host even when Next sees internal HTTP", async () => {
    const response = await GET(
      new Request(`http://localhost:3000${path}`, {
        headers: { host: "maiah.deodis.com" },
      }),
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "https://login.microsoftonline.com/test/authorize",
    );
    expect(mocks.signInSocial).toHaveBeenCalledOnce();
  });
  it("moves the legacy domain to canonical before issuing OAuth state cookies", async () => {
    const response = await GET(
      new Request(`http://localhost:3000${path}`, {
        headers: { host: "maiah.shiftify.eco" },
      }),
    );
    expect(response.headers.get("location")).toBe(
      `https://maiah.deodis.com${path}`,
    );
    expect(mocks.signInSocial).not.toHaveBeenCalled();
  });
  it("does not trust a forwarded host to bypass canonical routing", async () => {
    const response = await GET(
      new Request(`http://localhost:3000${path}`, {
        headers: {
          host: "other.example",
          "x-forwarded-host": "maiah.deodis.com",
        },
      }),
    );
    expect(response.headers.get("location")).toBe(
      `https://maiah.deodis.com${path}`,
    );
    expect(mocks.signInSocial).not.toHaveBeenCalled();
  });
});
