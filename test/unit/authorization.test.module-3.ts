import { describe,expect,it,vi } from "vitest";

import { authorization } from "@/server/domain/services/authorization";
import { cache } from "@/server/infrastructure/cache";
import { dbModule } from "./authorization.test.db-module";

// ─── authorization.requireWorkspaceMember ────────────────────────────

describe("authorization.requireWorkspaceMember", () => {
  it("returns true when user is an active member", async () => {
    dbModule.db.select.mockReturnValue(dbModule._c);
    dbModule._c.from.mockReturnValue(dbModule._c);
    dbModule._c.where.mockReturnValue(dbModule._c);
    dbModule._c.limit.mockResolvedValueOnce([{ organizationId: "org-1" }]).mockResolvedValueOnce([{ id: "member-1", status: "active" }]);

    const result = await authorization.requireWorkspaceMember("user-1", "ws-1");

    expect(result).toBe(true);
  });

  it("returns false when the organization membership is suspended", async () => {
    dbModule.db.select.mockReturnValue(dbModule._c);
    dbModule._c.from.mockReturnValue(dbModule._c);
    dbModule._c.where.mockReturnValue(dbModule._c);
    dbModule._c.limit.mockResolvedValueOnce([{ organizationId: "org-1" }]).mockResolvedValueOnce([{ id: "member-1", status: "suspended" }]);

    const result = await authorization.requireWorkspaceMember("user-1", "ws-1");

    expect(result).toBe(false);
  });

  it("accepts an active legacy project member without an organization row", async () => {
    dbModule.db.select.mockReturnValue(dbModule._c);
    dbModule._c.from.mockReturnValue(dbModule._c);
    dbModule._c.where.mockReturnValue(dbModule._c);
    dbModule._c.limit
      .mockResolvedValueOnce([{ organizationId: "org-1" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "workspace-member-1" }]);

    const result = await authorization.requireWorkspaceMember("user-1", "ws-1");

    expect(result).toBe(true);
  });

  it("returns false when user is not an active member", async () => {
    dbModule.db.select.mockReturnValue(dbModule._c);
    dbModule._c.from.mockReturnValue(dbModule._c);
    dbModule._c.where.mockReturnValue(dbModule._c);
    dbModule._c.limit.mockResolvedValueOnce([]);

    const result = await authorization.requireWorkspaceMember("user-1", "ws-1");

    expect(result).toBe(false);
  });
});

// ─── authorization.invalidatePermissionCache ─────────────────────────

describe("authorization.invalidatePermissionCache", () => {
  it("deletes cache entry", async () => {
    await authorization.invalidatePermissionCache("user-1", "workspace", "ws-1");

    expect(vi.mocked(cache.del)).toHaveBeenCalledWith("perm:user:user-1:workspace:ws-1");
  });
});
