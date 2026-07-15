import { beforeEach, describe, expect, it, vi } from "vitest";

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

import * as _dbModule from "@/server/infrastructure/db";
const dbModule = _dbModule as unknown as DbModule;
import { callRemoteMcpTool } from "@/modules/mcp/client";
import { getMcpServer } from "@/modules/mcp/use-cases";
import { resolveToolExecutionHeaders } from "@/modules/tool-connections/use-cases";

function resetDb() {
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

// ─── MCP Executor ─────────────────────────────────────────────────────

describe("mcp/executor", async () => {
	const fakeSseServer = {
		id: "srv-1",
		workspaceId: "ws-1",
		name: "Remote Server",
		transport: "sse" as const,
		command: null,
		argsJson: null,
		url: "https://mcp.example.com/sse",
		encryptedHeadersJson: null,
		encryptedEnvJson: null,
		enabled: true,
		requireApproval: false,
		isGlobal: false,
		healthStatus: "healthy",
		lastCheckedAt: null,
		createdById: "user-1",
		createdAt: new Date(),
		updatedAt: new Date(),
		archivedAt: null,
	};

	beforeEach(() => {
		vi.clearAllMocks();
		resetDb();
		vi.mocked(callRemoteMcpTool).mockReset();
		vi.mocked(getMcpServer).mockReset();
		vi.mocked(resolveToolExecutionHeaders).mockReset().mockResolvedValue({});
	});

	it("throws when server not found", async () => {
		(vi.mocked(getMcpServer) as ReturnType<typeof vi.fn>).mockResolvedValue(
			null,
		);

		const { executeMcpTool } = await import("../../src/modules/mcp/executor");
		await expect(
			executeMcpTool({
				serverId: "srv-1",
				toolId: "tool-1",
				workspaceId: "ws-1",
				toolInput: {},
			}),
		).rejects.toThrow("MCP server not found");
	});

	it("throws when server disabled", async () => {
		vi.mocked(getMcpServer).mockResolvedValue({
			...fakeSseServer,
			enabled: false,
		});

		const { executeMcpTool } = await import("../../src/modules/mcp/executor");
		await expect(
			executeMcpTool({
				serverId: "srv-1",
				toolId: "tool-1",
				workspaceId: "ws-1",
				toolInput: {},
			}),
		).rejects.toThrow("MCP server is disabled");
	});

	it("throws when server URL not configured", async () => {
		vi.mocked(getMcpServer).mockResolvedValue({
			...fakeSseServer,
			url: null,
		});

		const { executeMcpTool } = await import("../../src/modules/mcp/executor");
		await expect(
			executeMcpTool({
				serverId: "srv-1",
				toolId: "tool-1",
				workspaceId: "ws-1",
				toolInput: {},
			}),
		).rejects.toThrow("MCP server URL is not configured");
	});

	it("throws when tool not found", async () => {
		vi.mocked(getMcpServer).mockResolvedValue(fakeSseServer);

		dbModule.db.select.mockReturnValue(dbModule._c);
		dbModule._c.from.mockReturnValue(dbModule._c);
		dbModule._c.where.mockReturnValue(dbModule._c);
		dbModule._c.limit.mockResolvedValueOnce([]);

		const { executeMcpTool } = await import("../../src/modules/mcp/executor");
		await expect(
			executeMcpTool({
				serverId: "srv-1",
				toolId: "tool-1",
				workspaceId: "ws-1",
				toolInput: {},
			}),
		).rejects.toThrow("MCP tool not found");
	});

	it("returns structuredContent when present", async () => {
		vi.mocked(getMcpServer).mockResolvedValue(fakeSseServer);
		vi.mocked(callRemoteMcpTool).mockResolvedValue({
			structuredContent: { result: "data" },
			content: [{ type: "text", text: "raw" }],
		});

		dbModule.db.select.mockReturnValue(dbModule._c);
		dbModule._c.from.mockReturnValue(dbModule._c);
		dbModule._c.where.mockReturnValue(dbModule._c);
		dbModule._c.limit.mockResolvedValueOnce([
			{ id: "tool-1", name: "search", enabled: true },
		]);

		const { executeMcpTool } = await import("../../src/modules/mcp/executor");
		const result = await executeMcpTool({
			serverId: "srv-1",
			toolId: "tool-1",
			workspaceId: "ws-1",
			toolInput: { query: "test" },
		});
		expect(result).toEqual({ result: "data" });
	});

	it("passes per-user gateway headers when a user id is present", async () => {
		vi.mocked(getMcpServer).mockResolvedValue(fakeSseServer);
		vi.mocked(resolveToolExecutionHeaders).mockResolvedValue({
			"x-maiah-tool-context": "payload",
			"x-maiah-tool-context-signature": "sig",
		});
		vi.mocked(callRemoteMcpTool).mockResolvedValue({
			structuredContent: { result: "data" },
			content: [{ type: "text", text: "data" }],
		});

		dbModule.db.select.mockReturnValue(dbModule._c);
		dbModule._c.from.mockReturnValue(dbModule._c);
		dbModule._c.where.mockReturnValue(dbModule._c);
		dbModule._c.limit.mockResolvedValueOnce([
			{ id: "tool-1", name: "search", enabled: true },
		]);

		const { executeMcpTool } = await import("../../src/modules/mcp/executor");
		await executeMcpTool({
			serverId: "srv-1",
			toolId: "tool-1",
			workspaceId: "ws-1",
			userId: "user-1",
			toolInput: { query: "test" },
		});

		expect(resolveToolExecutionHeaders).toHaveBeenCalledWith({
			workspaceId: "ws-1",
			userId: "user-1",
			toolSource: "mcp",
			toolId: "tool-1",
			mcpServerId: "srv-1",
		});
		expect(callRemoteMcpTool).toHaveBeenCalledWith(
			fakeSseServer,
			"search",
			{ query: "test" },
			{
				headers: {
					"x-maiah-tool-context": "payload",
					"x-maiah-tool-context-signature": "sig",
				},
			},
		);
	});

	it("returns content when only content present", async () => {
		vi.mocked(getMcpServer).mockResolvedValue(fakeSseServer);
		vi.mocked(callRemoteMcpTool).mockResolvedValue({
			content: [{ type: "text", text: "raw response" }],
		});

		dbModule.db.select.mockReturnValue(dbModule._c);
		dbModule._c.from.mockReturnValue(dbModule._c);
		dbModule._c.where.mockReturnValue(dbModule._c);
		dbModule._c.limit.mockResolvedValueOnce([
			{ id: "tool-1", name: "search", enabled: true },
		]);

		const { executeMcpTool } = await import("../../src/modules/mcp/executor");
		const result = await executeMcpTool({
			serverId: "srv-1",
			toolId: "tool-1",
			workspaceId: "ws-1",
			toolInput: {},
		});
		expect(result).toEqual([{ type: "text", text: "raw response" }]);
	});

	it("rejects MCP application errors instead of treating them as tool successes", async () => {
		vi.mocked(getMcpServer).mockResolvedValue(fakeSseServer);
		vi.mocked(callRemoteMcpTool).mockResolvedValue({
			isError: true,
			structuredContent: {
				result: "Invalid repoName format",
				apiKey: "must-not-leak",
			},
			content: [{ type: "text", text: "raw error" }],
		});

		dbModule.db.select.mockReturnValue(dbModule._c);
		dbModule._c.from.mockReturnValue(dbModule._c);
		dbModule._c.where.mockReturnValue(dbModule._c);
		dbModule._c.limit.mockResolvedValueOnce([
			{ id: "tool-1", name: "search", enabled: true },
		]);

		const { executeMcpTool } = await import("../../src/modules/mcp/executor");
		const error = await executeMcpTool({
			serverId: "srv-1",
			toolId: "tool-1",
			workspaceId: "ws-1",
			toolInput: {},
		}).catch((cause: unknown) => cause);
		expect(error).toBeInstanceOf(Error);
		expect((error as Error).message).toBe(
			"MCP tool failed: Invalid repoName format",
		);
		expect((error as Error).message).not.toContain("must-not-leak");
	});

	it("returns { ok: true } when result has no structuredContent or content", async () => {
		vi.mocked(getMcpServer).mockResolvedValue(fakeSseServer);
		// When result has no structuredContent and no content properties
		vi.mocked(callRemoteMcpTool).mockResolvedValue({
			someOtherField: "value",
			content: undefined as never,
			structuredContent: undefined as never,
		});

		dbModule.db.select.mockReturnValue(dbModule._c);
		dbModule._c.from.mockReturnValue(dbModule._c);
		dbModule._c.where.mockReturnValue(dbModule._c);
		dbModule._c.limit.mockResolvedValueOnce([
			{ id: "tool-1", name: "search", enabled: true },
		]);

		const { executeMcpTool } = await import("../../src/modules/mcp/executor");
		const result = await executeMcpTool({
			serverId: "srv-1",
			toolId: "tool-1",
			workspaceId: "ws-1",
			toolInput: {},
		});
		expect(result).toEqual({ ok: true });
	});
});
