import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  isPlatformAdminSession: vi.fn(),
}));

vi.mock("@/modules/auth/session", () => ({
  getSession: mocks.getSession,
}));

vi.mock("@/lib/route-handler", () => ({
  handleRoute: vi.fn(),
  requireWorkspacePermissionAsync: vi.fn(),
}));

vi.mock("@/modules/admin/auth", () => ({
  isPlatformAdminSession: mocks.isPlatformAdminSession,
  getSession: mocks.getSession,
}));

vi.mock("@/server/infrastructure/db", () => {
  const selectChain = {
    from: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
  };
  const updateChain = {
    set: vi.fn(),
    where: vi.fn(),
    returning: vi.fn(),
  };
  const insertChain = {
    values: vi.fn(),
    returning: vi.fn(),
  };
  const deleteChain = {
    where: vi.fn(),
  };
  return {
    db: {
      select: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      transaction: vi.fn(),
    },
    _selectChain: selectChain,
    _updateChain: updateChain,
    _insertChain: insertChain,
    _deleteChain: deleteChain,
  } as {
    db: {
      select: ReturnType<typeof vi.fn>;
      insert: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      delete: ReturnType<typeof vi.fn>;
      transaction: ReturnType<typeof vi.fn>;
    };
    _selectChain: typeof selectChain;
    _updateChain: typeof updateChain;
    _insertChain: typeof insertChain;
    _deleteChain: typeof deleteChain;
  };
});

import * as dbModule from "@/server/infrastructure/db";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/marketplace/items/route";

const chains = dbModule as unknown as {
  db: { select: ReturnType<typeof vi.fn> };
  _selectChain: {
    from: ReturnType<typeof vi.fn>;
    where: ReturnType<typeof vi.fn>;
    orderBy: ReturnType<typeof vi.fn>;
    limit: ReturnType<typeof vi.fn>;
  };
};

function request(query: string) {
  return new NextRequest(
    `http://localhost/api/marketplace/items${query ? `?${query}` : ""}`,
  );
}

function givenSelectOrderBy(value: unknown) {
  chains._selectChain.orderBy.mockResolvedValue(value);
}

beforeEach(() => {
  vi.clearAllMocks();
  const sc = chains._selectChain;
  sc.from.mockReset().mockReturnThis();
  sc.where.mockReset().mockReturnThis();
  sc.orderBy.mockReset().mockResolvedValue([]);
  sc.limit.mockReset().mockResolvedValue([]);
  chains.db.select.mockReturnValue(chains._selectChain);
  mocks.getSession.mockResolvedValue(null);
  mocks.isPlatformAdminSession.mockResolvedValue(false);
});

describe("GET /api/marketplace/items type filter", () => {
  it("passes enum values through to the list query", async () => {
    const items = [{ id: "1", name: "Agent" }];
    givenSelectOrderBy(items);

    const response = await GET(request("type=agent,skill"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(items);
    // The full route → use-case chain ran the bound drizzle query.
    expect(chains._selectChain.orderBy).toHaveBeenCalled();
  });

  it("rejects non-enum type values with a generic 400 and no input echo", async () => {
    const payload = "agent'); DROP TABLE marketplace_items;--";

    const response = await GET(request(`type=${encodeURIComponent(payload)}`));

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toEqual({ error: "Invalid input" });
    expect(JSON.stringify(body)).not.toContain(payload);
    // The query was never built or run for an invalid filter.
    expect(chains._selectChain.orderBy).not.toHaveBeenCalled();
  });

  it("rejects uppercase enum values (filter is case-sensitive)", async () => {
    const response = await GET(request("type=AGENT"));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid input" });
  });

  it("rejects empty segments in the type list", async () => {
    const response = await GET(request("type=agent,,skill"));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid input" });
  });

  it("lists without a type filter", async () => {
    const items = [{ id: "1", name: "Agent" }];
    givenSelectOrderBy(items);

    const response = await GET(request("search=agent"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(items);
  });
});
