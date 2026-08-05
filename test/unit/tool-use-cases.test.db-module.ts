import { beforeEach, describe, expect, it, vi } from "vitest";

import * as _dbModule from "@/server/infrastructure/db";
import { authorization } from "@/server/domain/services/authorization";
import {
	canExecuteRestrictedTool,
	cloneToolBindings,
	getAgentVersionToolContext,
	getCustomBindingContext,
	getMcpBindingContext,
	getToolBindingsForVersion,
	insertToolBindingsForVersion,
	logToolInvocation,
	replaceToolBindingsForVersion,
	toolBindingInputSchema,
} from "@/modules/tool/use-cases";

// ─── Mocks ────────────────────────────────────────────────────────────

vi.mock("@/lib/crypto", () => ({
	encryptValue: vi
		.fn()
		.mockResolvedValue('{"ct":"enc","iv":"iv","kid":"default"}'),
}));

vi.mock("@/server/domain/services/authorization", () => ({
	authorization: {
		requirePermission: vi.fn().mockResolvedValue({ granted: true }),
		hasPermission: vi.fn().mockResolvedValue(true),
	},
}));

type SelectChain = {
	from: ReturnType<typeof vi.fn>;
	innerJoin: ReturnType<typeof vi.fn>;
	where: ReturnType<typeof vi.fn>;
	limit: ReturnType<typeof vi.fn>;
};

type InsertChain = {
	values: ReturnType<typeof vi.fn>;
	returning: ReturnType<typeof vi.fn>;
	onConflictDoNothing: ReturnType<typeof vi.fn>;
};

type DeleteChain = {
	where: ReturnType<typeof vi.fn>;
};

type DbMock = {
	select: ReturnType<typeof vi.fn>;
	insert: ReturnType<typeof vi.fn>;
	delete: ReturnType<typeof vi.fn>;
};

type DbModule = {
	db: DbMock;
	_sc: SelectChain;
	_ic: InsertChain;
	_dc: DeleteChain;
};

vi.mock("@/server/infrastructure/db", () => {
	const sc: SelectChain = {
		from: vi.fn().mockReturnThis(),
		innerJoin: vi.fn().mockReturnThis(),
		where: vi.fn().mockReturnThis(),
		limit: vi.fn().mockResolvedValue([]),
	};
	const ic: InsertChain = {
		values: vi.fn().mockReturnThis(),
		returning: vi.fn().mockResolvedValue([]),
		onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
	};
	const dc: DeleteChain = {
		where: vi.fn().mockResolvedValue(undefined),
	};
	return {
		db: {
			select: vi.fn(),
			insert: vi.fn(),
			delete: vi.fn(),
		},
		_sc: sc,
		_ic: ic,
		_dc: dc,
	};
});
export const dbModule = _dbModule as unknown as DbModule;

function reset() {
	dbModule._sc.from.mockReset().mockReturnThis();
	dbModule._sc.innerJoin.mockReset().mockReturnThis();
	dbModule._sc.where.mockReset().mockReturnThis();
	dbModule._sc.limit.mockReset().mockResolvedValue([]);
	dbModule._ic.values.mockReset().mockReturnThis();
	dbModule._ic.returning.mockReset().mockResolvedValue([]);
	dbModule._ic.onConflictDoNothing.mockReset().mockResolvedValue(undefined);
	dbModule._dc.where.mockReset().mockResolvedValue(undefined);
}

beforeEach(() => {
	vi.clearAllMocks();
	reset();
	dbModule.db.select.mockReturnValue(dbModule._sc);
	dbModule.db.insert.mockReturnValue(dbModule._ic);
	dbModule.db.delete.mockReturnValue(dbModule._dc);
});

describe("toolBindingInputSchema", () => {
	it("validates builtin source", () => {
		expect(
			toolBindingInputSchema.safeParse({
				toolSource: "builtin",
				toolId: crypto.randomUUID(),
			}).success,
		).toBe(true);
	});

	it("validates mcp source with serverId", () => {
		expect(
			toolBindingInputSchema.safeParse({
				toolSource: "mcp",
				toolId: crypto.randomUUID(),
				mcpServerId: crypto.randomUUID(),
			}).success,
		).toBe(true);
	});

	it("rejects mcp source without serverId", () => {
		expect(
			toolBindingInputSchema.safeParse({
				toolSource: "mcp",
				toolId: crypto.randomUUID(),
			}).success,
		).toBe(false);
	});

	it("validates custom source", () => {
		expect(
			toolBindingInputSchema.safeParse({
				toolSource: "custom",
				toolId: crypto.randomUUID(),
			}).success,
		).toBe(true);
	});

	it("rejects invalid toolSource", () => {
		expect(
			toolBindingInputSchema.safeParse({
				toolSource: "unknown",
				toolId: crypto.randomUUID(),
			}).success,
		).toBe(false);
	});
});

describe("getToolBindingsForVersion", () => {
	it("queries bindings for a version", async () => {
		const mockBindings = [
			{ toolSource: "builtin", toolId: "tool-1", agentVersionId: "v1" },
		];
		dbModule._sc.where.mockResolvedValueOnce(mockBindings);

		const result = await getToolBindingsForVersion("v1");
		expect(result).toEqual(mockBindings);
	});

	it("returns empty array when no bindings", async () => {
		dbModule._sc.where.mockResolvedValueOnce([]);

		const result = await getToolBindingsForVersion("v1");
		expect(result).toEqual([]);
	});

	it("filters custom and MCP bindings to resources visible to the user", async () => {
		const bindings = [
			{ id: "b1", toolSource: "builtin", toolId: "builtin-1" },
			{ id: "b2", toolSource: "custom", toolId: "custom-visible" },
			{ id: "b3", toolSource: "custom", toolId: "custom-private" },
			{ id: "b4", toolSource: "mcp", toolId: "mcp-visible" },
			{ id: "b5", toolSource: "mcp", toolId: "mcp-private" },
		];
		dbModule._sc.where
			.mockResolvedValueOnce(bindings)
			.mockResolvedValueOnce([{ id: "custom-visible" }])
			.mockResolvedValueOnce([{ id: "mcp-visible" }]);

		const result = await getToolBindingsForVersion("v1", {
			workspaceId: "ws-1",
			userId: "user-1",
		});

		expect(result.map((binding) => binding.id)).toEqual(["b1", "b2", "b4"]);
	});
});
