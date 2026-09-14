import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  usage: vi.fn(),
  audit: vi.fn(),
}));
vi.mock("@/lib/route-handler", () => ({
  handleRoute: (_req: unknown, handler: (ctx: unknown) => unknown) =>
    handler({ session: { user: { id: "actor" } } }),
}));
vi.mock("@/modules/analytics/scope", () => ({
  authorizeAnalytics: mocks.authorize,
}));
vi.mock("@/modules/analytics/usage", () => ({
  getUsageAnalytics: mocks.usage,
}));
vi.mock("@/modules/analytics/audit", () => ({
  getAuditAnalytics: mocks.audit,
}));
import { handleAnalytics } from "@/modules/analytics/route";
describe("analytics API boundary and exports", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorize.mockResolvedValue({ id: "application", canExport: true });
    mocks.usage.mockResolvedValue({
      totals: { events: 1 },
      events: [
        {
          id: "test",
          createdAt: new Date("2026-09-01T00:00:00Z"),
          userName: "=bad",
        },
      ],
    });
    mocks.audit.mockResolvedValue({ totals: { total: 0 }, events: [] });
  });
  const request = (query: string) =>
    new NextRequest(`http://localhost/api/analytics/usage?${query}`);
  it("rejects malformed input before database reads", async () => {
    expect(
      (await handleAnalytics(request("scope=organization"), "usage")).status,
    ).toBe(400);
    expect(mocks.authorize).not.toHaveBeenCalled();
  });
  it("rejects unauthorized scopes before any data query", async () => {
    mocks.authorize.mockResolvedValue(undefined);
    expect(
      (await handleAnalytics(request("scope=application"), "audit")).status,
    ).toBe(403);
    expect(mocks.audit).not.toHaveBeenCalled();
  });
  it("returns private, uncached JSON and enforces audit export separately", async () => {
    const res = await handleAnalytics(request("scope=application"), "usage");
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect((await res.json()).totals.events).toBe(1);
    mocks.authorize.mockResolvedValue({ canExport: false });
    expect(
      (await handleAnalytics(request("scope=application&format=csv"), "audit"))
        .status,
    ).toBe(403);
    expect(mocks.audit).not.toHaveBeenCalled();
  });
  it("exports every filtered row rather than the visible page, escapes formulas, and never silently truncates", async () => {
    const res = await handleAnalytics(
      request("scope=application&offset=100&format=csv"),
      "usage",
    );
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(await res.text()).toContain("'=bad");
    expect(mocks.usage).toHaveBeenCalledWith(
      expect.objectContaining({ offset: 0, limit: 10000 }),
    );
    mocks.usage.mockResolvedValue({ totals: { events: 10001 }, events: [] });
    expect(
      (await handleAnalytics(request("scope=application&format=csv"), "usage"))
        .status,
    ).toBe(413);
    expect(
      (await handleAnalytics(request("scope=application&format=csv"), "audit"))
        .status,
    ).toBe(200);
  });
});
