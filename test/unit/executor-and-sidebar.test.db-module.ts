import { vi } from "vitest";

import * as _dbModule from "@/server/infrastructure/db";

// ─── Mocks ────────────────────────────────────────────────────────────

vi.mock("@/server/domain/services/audit", () => ({
	audit: { emit: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock("@/lib/logger", () => ({
	logHandledWarning: vi.fn(),
	logHandledError: vi.fn(),
	logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/crypto", () => ({
	encryptValue: vi.fn().mockResolvedValue("enc:value"),
	decryptValue: vi.fn().mockResolvedValue("decrypted"),
}));

vi.mock("@/modules/mcp/client", () => ({
	callRemoteMcpTool: vi.fn(),
	listRemoteMcpTools: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/modules/mcp/auth-hint", () => ({
	inferMcpAuthHint: vi.fn().mockReturnValue("none"),
}));

vi.mock("@/modules/mcp/use-cases", () => {
	const mockGetMcpServer = vi.fn();
	return {
		getMcpServer: mockGetMcpServer,
	};
});

vi.mock("@/modules/tool-connections/use-cases", () => ({
	resolveToolExecutionHeaders: vi.fn().mockResolvedValue({}),
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
	_tx: Chain;
};

vi.mock("@/server/infrastructure/db", () => {
	const chain = makeChain();
	const tx = makeChain();
	return {
		db: {
			select: vi.fn(),
			insert: vi.fn(),
			update: vi.fn(),
			delete: vi.fn(),
			transaction: vi.fn(),
		},
		_c: chain,
		_tx: tx,
	};
});
export const dbModule = _dbModule as unknown as DbModule;

export function resetDb() {
	for (const chain of [dbModule._c, dbModule._tx]) {
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
		] as const) {
			chain[k].mockReset().mockReturnThis();
		}
		chain.limit.mockReset().mockResolvedValue([]);
		chain.returning.mockReset().mockResolvedValue([]);
	}
}
