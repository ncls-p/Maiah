import { beforeEach, describe, expect, it, vi } from "vitest";

import { resolvePermissions } from "@/server/domain/services/authorization.resolve-permissions";
import { permissionResolutions } from "@/server/domain/services/authorization.permission-cache-ttl";
import { cache } from "@/server/infrastructure/cache";
import { findAccessResource } from "@/server/infrastructure/db/access-resource-repository";
import * as _db from "@/server/infrastructure/db";
import * as _ttl from "@/server/domain/services/authorization.permission-cache-ttl";

// ─── Mocks ────────────────────────────────────────────────────────────

vi.mock("@/server/infrastructure/db", () => makeDbMock());
vi.mock("@/server/infrastructure/cache", () => ({
  cache: { get: vi.fn(), set: vi.fn(), del: vi.fn() },
}));
vi.mock("@/server/infrastructure/db/access-resource-repository", () => ({
  findAccessResource: vi.fn(),
}));
vi.mock(
  "@/server/domain/services/authorization.permission-cache-ttl",
  async (importOriginal) => {
    const actual = await importOriginal<typeof _ttl>();
    return {
      ...actual,
      isActiveWorkspaceMember: vi.fn(),
      isActiveOrganizationMember: vi.fn(),
    };
  },
);

// A drizzle-like chain where every clause returns itself, `.limit()` resolves
// the next queued result, and awaiting the chain (terminal `.where()`) also
// resolves the next queued result.
function makeDbMock() {
  const state = { queue: [] as unknown[][], calls: 0 };
  const next = () => state.queue[state.calls++] ?? [];
  function makeChain() {
    const chain: Record<string, unknown> = {};
    for (const k of [
      "from",
      "innerJoin",
      "leftJoin",
      "where",
      "orderBy",
      "groupBy",
    ]) {
      chain[k] = vi.fn(() => chain);
    }
    chain.limit = vi.fn(() => Promise.resolve(next()));
    chain.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(next()).then(resolve, reject);
    return chain;
  }
  const db = {
    select: vi.fn(() => makeChain()),
    insert: vi.fn(() => makeChain()),
    update: vi.fn(() => makeChain()),
    delete: vi.fn(() => makeChain()),
    transaction: vi.fn(),
  };
  return { db, state };
}

const dbMock = _db as unknown as {
  db: ReturnType<typeof makeDbMock>["db"];
  state: { queue: unknown[][]; calls: number };
};

function enqueue(...results: unknown[][]) {
  dbMock.state.queue = results;
  dbMock.state.calls = 0;
}

beforeEach(() => {
  vi.clearAllMocks();
  permissionResolutions.clear();
  dbMock.state.queue = [];
  dbMock.state.calls = 0;
  vi.mocked(cache.get).mockResolvedValue(null);
  vi.mocked(cache.set).mockResolvedValue(undefined as never);
  vi.mocked(_ttl.isActiveWorkspaceMember).mockResolvedValue(true);
  vi.mocked(_ttl.isActiveOrganizationMember).mockResolvedValue(true);
  vi.mocked(findAccessResource).mockResolvedValue(undefined as never);
});

const user = { principalType: "user" as const, principalId: "user-1" };
const binding = (perm: string) => [
  { roles: { name: "custom", permissionsJson: [perm] } },
];

describe("resolvePermissions branch coverage", () => {
  it("resolves organization resources for an active org member with teams", async () => {
    enqueue([{ teamId: "team-1" }], binding("agents.create"));
    const result = await resolvePermissions(user, "organization", "org-a");
    expect(result).toContain("agents.create");
    expect(dbMock.state.calls).toBe(2);
  });

  it("returns no permissions for an inactive organization member", async () => {
    vi.mocked(_ttl.isActiveOrganizationMember).mockResolvedValue(false);
    const result = await resolvePermissions(user, "organization", "org-b");
    expect(result).toEqual([]);
    expect(dbMock.state.calls).toBe(0);
  });

  it("resolves workspace resources for an active workspace member", async () => {
    enqueue(
      [{ organizationId: "org-1" }],
      [{ teamId: "team-1" }],
      binding("workspaces.get"),
    );
    const result = await resolvePermissions(user, "workspace", "ws-c");
    expect(result).toContain("workspaces.get");
    expect(dbMock.state.calls).toBe(3);
  });

  it("returns no permissions for an inactive workspace member", async () => {
    vi.mocked(_ttl.isActiveWorkspaceMember).mockResolvedValue(false);
    enqueue([{ organizationId: "org-1" }]);
    const result = await resolvePermissions(user, "workspace", "ws-d");
    expect(result).toEqual([]);
    expect(dbMock.state.calls).toBe(1);
  });

  it("resolves agent resources through the access resource repository", async () => {
    vi.mocked(findAccessResource).mockResolvedValue({
      workspaceId: "ws-1",
      organizationId: "org-1",
      parent: { type: "workspace", id: "ws-1" },
    } as never);
    enqueue([{ teamId: "team-1" }], binding("agents.get"));
    const result = await resolvePermissions(user, "agent", "agent-e");
    expect(result).toContain("agents.get");
    expect(findAccessResource).toHaveBeenCalledWith("agent", "agent-e");
    expect(dbMock.state.calls).toBe(2);
  });

  it("handles a workspace with a null organization id", async () => {
    enqueue([{ organizationId: null }], binding("workspaces.list"));
    const result = await resolvePermissions(user, "workspace", "ws-f");
    expect(result).toContain("workspaces.list");
    expect(dbMock.state.calls).toBe(2);
  });

  it("resolves organization resources for a non-user principal", async () => {
    enqueue(binding("roles.manage"));
    const result = await resolvePermissions(
      { principalType: "group", principalId: "group-1" },
      "organization",
      "org-g",
    );
    expect(result).toContain("roles.manage");
    expect(dbMock.state.calls).toBe(1);
  });
});