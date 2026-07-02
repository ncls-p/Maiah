import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────

vi.mock("@/lib/logger", () => ({
	logHandledError: vi.fn(),
	logHandledWarning: vi.fn(),
	logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/crypto", () => ({
	encryptValue: vi.fn().mockResolvedValue("enc:value"),
	decryptValue: vi.fn().mockResolvedValue("decrypted"),
}));

type Chain = {
	select: ReturnType<typeof vi.fn>;
	insert: ReturnType<typeof vi.fn>;
	update: ReturnType<typeof vi.fn>;
	delete: ReturnType<typeof vi.fn>;
	from: ReturnType<typeof vi.fn>;
	where: ReturnType<typeof vi.fn>;
	orderBy: ReturnType<typeof vi.fn>;
	limit: ReturnType<typeof vi.fn>;
	values: ReturnType<typeof vi.fn>;
	set: ReturnType<typeof vi.fn>;
	returning: ReturnType<typeof vi.fn>;
	innerJoin: ReturnType<typeof vi.fn>;
};

function makeChain(): Chain {
	const c = {} as Chain;
	for (const k of [
		"select",
		"insert",
		"update",
		"delete",
		"from",
		"where",
		"orderBy",
		"values",
		"set",
		"innerJoin",
	] as const) {
		c[k] = vi.fn().mockReturnThis();
	}
	c.limit = vi.fn().mockResolvedValue([]);
	c.returning = vi.fn().mockResolvedValue([]);
	return c;
}

type DbMock = {
	select: ReturnType<typeof vi.fn>;
	insert: ReturnType<typeof vi.fn>;
	update: ReturnType<typeof vi.fn>;
	delete: ReturnType<typeof vi.fn>;
	transaction: ReturnType<typeof vi.fn>;
};

type DbModule = {
	db: DbMock;
	_c: Chain;
};

vi.mock("@/server/infrastructure/db", () => {
	const chain = makeChain();
	return {
		db: {
			select: vi.fn(),
			insert: vi.fn(),
			update: vi.fn(),
			delete: vi.fn(),
			transaction: vi.fn(),
		},
		_c: chain,
	};
});

vi.mock("@/server/infrastructure/cache", () => ({
	cache: {
		get: vi.fn(),
		set: vi.fn(),
		del: vi.fn(),
	},
}));

import * as _dbModule from "@/server/infrastructure/db";
const dbModule = _dbModule as unknown as DbModule;
import { cache } from "@/server/infrastructure/cache";
import { matchesPermission } from "@/server/domain/services/authorization";
import { authorization } from "@/server/domain/services/authorization";

function resetDb() {
	for (const k of [
		"select",
		"insert",
		"update",
		"delete",
		"from",
		"where",
		"orderBy",
		"values",
		"set",
		"innerJoin",
	] as const) {
		dbModule._c[k].mockReset().mockReturnThis();
	}
	dbModule._c.limit.mockReset().mockResolvedValue([]);
	dbModule._c.returning.mockReset().mockResolvedValue([]);
}

beforeEach(() => {
	vi.clearAllMocks();
	resetDb();
	vi.mocked(cache.get).mockReset();
	vi.mocked(cache.set).mockReset();
	vi.mocked(cache.del).mockReset();
});

// ─── matchesPermission (pure function) ───────────────────────────────

describe("matchesPermission", () => {
	it("matches exact permission", () => {
		expect(matchesPermission("agents.create", "agents.create")).toBe(true);
	});

	it("matches wildcard grants", () => {
		expect(matchesPermission("agents.*", "agents.create")).toBe(true);
		expect(matchesPermission("agents.*", "agents.delete")).toBe(true);
	});

	it("matches manage grants for domain actions", () => {
		expect(matchesPermission("agents.manage", "agents.create")).toBe(true);
	});

	it("does not match different domains", () => {
		expect(matchesPermission("agents.create", "providers.create")).toBe(false);
	});

	it("lets view grants satisfy read-oriented actions", () => {
		expect(matchesPermission("tools.view", "tools.get")).toBe(true);
		expect(matchesPermission("tools.view", "tools.list")).toBe(true);
		expect(matchesPermission("tools.view", "tools.view")).toBe(true);
		expect(matchesPermission("tools.view", "tools.viewAllowed")).toBe(true);
		expect(matchesPermission("tools.view", "tools.viewLimited")).toBe(true);
		expect(matchesPermission("tools.view", "tools.viewMetadata")).toBe(true);
		expect(matchesPermission("tools.view", "tools.viewOwn")).toBe(true);
		expect(matchesPermission("tools.view", "tools.viewShared")).toBe(true);
		expect(matchesPermission("tools.view", "tools.configure")).toBe(false);
	});

	it("handles granted permissions without action as domain wildcards", () => {
		expect(matchesPermission("agents", "agents.create")).toBe(true);
		expect(matchesPermission("agents", "agents")).toBe(true);
	});

	it("does not let a specific grant satisfy a wildcard requirement", () => {
		expect(matchesPermission("agents.create", "agents.*")).toBe(false);
	});
});

// ─── authorization.checkPermission ──────────────────────────────────

describe("authorization.checkPermission", () => {
	it("returns granted=false when no permissions", async () => {
		vi.mocked(cache.get).mockResolvedValue(null);
		dbModule.db.select.mockReturnValue(dbModule._c);
		dbModule._c.from.mockReturnValue(dbModule._c);
		dbModule._c.where.mockReturnValue(dbModule._c);
		dbModule._c.innerJoin.mockReturnValue(dbModule._c);
		dbModule._c.limit.mockResolvedValueOnce([]);

		const result = await authorization.checkPermission(
			{ principalType: "user", principalId: "user-1" },
			"agents.create",
			"workspace",
			"ws-1",
		);

		expect(result.granted).toBe(false);
		expect(result.reason).toContain("Missing permission");
	});

	it("returns granted=true when permission matches", async () => {
		vi.mocked(cache.get).mockResolvedValue(["agents.create"]);

		const result = await authorization.checkPermission(
			{ principalType: "user", principalId: "user-1" },
			"agents.create",
			"workspace",
			"ws-1",
		);

		expect(result.granted).toBe(true);
		expect(result.reason).toBeUndefined();
	});

	it("returns granted=true when wildcard matches", async () => {
		vi.mocked(cache.get).mockResolvedValue(["agents.*"]);

		const result = await authorization.checkPermission(
			{ principalType: "user", principalId: "user-1" },
			"agents.delete",
			"workspace",
			"ws-1",
		);

		expect(result.granted).toBe(true);
	});

	it("resolves database role bindings, system permissions, and caches unique permissions", async () => {
		vi.mocked(cache.get).mockResolvedValue(null);
		dbModule.db.select.mockReturnValue(dbModule._c);
		dbModule._c.where.mockReturnValueOnce(dbModule._c).mockResolvedValueOnce([
			{
				roles: {
					name: "workspace.member",
					permissionsJson: ["agents.create", "agents.create", "custom.do"],
				},
			},
		]);
		dbModule._c.limit.mockResolvedValueOnce([{ id: "member-1" }]);

		const result = await authorization.checkPermission(
			{ principalType: "user", principalId: "user-1" },
			"tools.executeRestricted",
			"workspace",
			"ws-1",
		);

		expect(result.granted).toBe(true);
		expect(cache.set).toHaveBeenCalledWith(
			"perm:user:user-1:workspace:ws-1",
			expect.arrayContaining([
				"agents.create",
				"tools.executeRestricted",
				"custom.do",
			]),
			60,
		);
	});

	it("returns granted=true when manage matches", async () => {
		vi.mocked(cache.get).mockResolvedValue(["agents.manage"]);

		const result = await authorization.checkPermission(
			{ principalType: "user", principalId: "user-1" },
			"agents.delete",
			"workspace",
			"ws-1",
		);

		expect(result.granted).toBe(true);
	});
});

// ─── authorization.requirePermission ─────────────────────────────────

describe("authorization.requirePermission", () => {
	it("returns granted result when permission is granted", async () => {
		vi.mocked(cache.get).mockResolvedValue(["agents.create"]);

		const result = await authorization.requirePermission(
			{ principalType: "user", principalId: "user-1" },
			"agents.create",
			"workspace",
			"ws-1",
		);

		expect(result.granted).toBe(true);
	});

	it("returns not-granted result when permission denied", async () => {
		vi.mocked(cache.get).mockResolvedValue([]);
		dbModule.db.select.mockReturnValue(dbModule._c);
		dbModule._c.from.mockReturnValue(dbModule._c);
		dbModule._c.where.mockReturnValue(dbModule._c);
		dbModule._c.innerJoin.mockReturnValue(dbModule._c);

		const result = await authorization.requirePermission(
			{ principalType: "user", principalId: "user-1" },
			"agents.create",
			"workspace",
			"ws-1",
		);

		expect(result.granted).toBe(false);
	});
});

// ─── authorization.hasPermission ─────────────────────────────────────

describe("authorization.hasPermission", () => {
	it("returns true when cached permission matches", async () => {
		vi.mocked(cache.get).mockResolvedValue(["agents.create"]);

		const result = await authorization.hasPermission(
			{ principalType: "user", principalId: "user-1" },
			"agents.create",
			"workspace",
			"ws-1",
		);

		expect(result).toBe(true);
	});

	it("returns false when no matching permission", async () => {
		vi.mocked(cache.get).mockResolvedValue([]);
		dbModule.db.select.mockReturnValue(dbModule._c);
		dbModule._c.from.mockReturnValue(dbModule._c);
		dbModule._c.where.mockReturnValue(dbModule._c);
		dbModule._c.innerJoin.mockReturnValue(dbModule._c);

		const result = await authorization.hasPermission(
			{ principalType: "user", principalId: "user-1" },
			"agents.create",
			"workspace",
			"ws-1",
		);

		expect(result).toBe(false);
	});
});

// ─── authorization.requireWorkspaceMember ────────────────────────────

describe("authorization.requireWorkspaceMember", () => {
	it("returns true when user is an active member", async () => {
		dbModule.db.select.mockReturnValue(dbModule._c);
		dbModule._c.from.mockReturnValue(dbModule._c);
		dbModule._c.where.mockReturnValue(dbModule._c);
		dbModule._c.limit.mockResolvedValueOnce([{ id: "member-1" }]);

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
		await authorization.invalidatePermissionCache(
			"user-1",
			"workspace",
			"ws-1",
		);

		expect(vi.mocked(cache.del)).toHaveBeenCalledWith(
			"perm:user:user-1:workspace:ws-1",
		);
	});
});
