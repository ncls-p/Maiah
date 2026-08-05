import { describe,expect,it,vi } from "vitest";

import { listRemoteMcpTools } from "@/modules/mcp/client";
import {
archiveMcpServer,
listMcpTools,
syncMcpTools,
testMcpConnection
} from "@/modules/mcp/use-cases";
import { dbModule,fakeSseServer,fakeStdioServer,fakeTool } from "./mcp-use-cases.test.db-module";


// ─── archiveMcpServer ─────────────────────────────────────────────────

describe("archiveMcpServer", () => {
	it("throws when server not found", async () => {
		await expect(archiveMcpServer("srv-1", "ws-1", "user-1")).rejects.toThrow(
			"MCP server not found",
		);
	});

	it("sets archivedAt and disables server", async () => {
		dbModule._c.limit.mockResolvedValueOnce([fakeSseServer]);

		await archiveMcpServer("srv-1", "ws-1", "user-1");

		expect(dbModule.db.update).toHaveBeenCalled();
	});
});

// ─── listMcpTools ─────────────────────────────────────────────────────

describe("listMcpTools", () => {
	it("throws when server not found", async () => {
		await expect(listMcpTools("srv-1", "ws-1")).rejects.toThrow(
			"MCP server not found",
		);
	});

	it("returns tools ordered by name", async () => {
		dbModule._c.limit.mockResolvedValueOnce([fakeSseServer]);
		dbModule._c.orderBy.mockResolvedValueOnce([fakeTool]);

		const tools = await listMcpTools("srv-1", "ws-1");
		expect(tools).toHaveLength(1);
		expect(tools[0].name).toBe("search");
	});
});

// ─── syncMcpTools ─────────────────────────────────────────────────────

describe("syncMcpTools", () => {
	it("throws when server not found", async () => {
		await expect(syncMcpTools("srv-1", "ws-1", "user-1")).rejects.toThrow(
			"MCP server not found",
		);
	});

	it("returns manual status for stdio transport", async () => {
		dbModule._c.limit.mockResolvedValueOnce([fakeStdioServer]);

		const result = await syncMcpTools("srv-2", "ws-1", "user-1");
		expect(result.status).toBe("manual");
		expect(result.discovered).toBe(0);
	});

	it("syncs tools for SSE transport", async () => {
		// Q1 (getMcpServer): .where() chains → .limit() terminal
		// Q2 (existing tools): .where() terminal
		dbModule._c.where
			.mockReturnValueOnce(dbModule._c) // Q1: keep chain for .limit()
			.mockResolvedValueOnce([]); // Q2: existing tools
		dbModule._c.limit.mockResolvedValueOnce([fakeSseServer]);
		vi.mocked(listRemoteMcpTools).mockResolvedValueOnce([
			{ name: "search", description: "Search" },
		] as never);

		const result = await syncMcpTools("srv-1", "ws-1", "user-1");
		expect(result.discovered).toBe(1);
		expect(result.status).toBe("healthy");
	});

	it("returns unhealthy status when remote call fails", async () => {
		dbModule._c.where
			.mockReturnValueOnce(dbModule._c)
			.mockResolvedValueOnce([]);
		dbModule._c.limit.mockResolvedValueOnce([fakeSseServer]);
		vi.mocked(listRemoteMcpTools).mockRejectedValueOnce(
			new Error("Connection refused"),
		);

		const result = await syncMcpTools("srv-1", "ws-1", "user-1");
		expect(result.status).toBe("unhealthy");
		expect(result.discovered).toBe(0);
		expect(dbModule._tx.delete).not.toHaveBeenCalled();
	});

	it("removes stale tools when a healthy server returns an empty catalog", async () => {
		dbModule._c.where
			.mockReturnValueOnce(dbModule._c)
			.mockResolvedValueOnce([{ name: "old-tool", requireApproval: false }]);
		dbModule._c.limit.mockResolvedValueOnce([fakeSseServer]);
		vi.mocked(listRemoteMcpTools).mockResolvedValueOnce([]);

		const result = await syncMcpTools("srv-1", "ws-1", "user-1");

		expect(result.status).toBe("healthy");
		expect(dbModule._tx.delete).toHaveBeenCalledOnce();
		expect(dbModule._tx.insert).not.toHaveBeenCalled();
	});

	it("preserves per-tool requireApproval from existing tools", async () => {
		dbModule._c.where
			.mockReturnValueOnce(dbModule._c) // Q1: getMcpServer where
			.mockResolvedValueOnce([{ name: "search", requireApproval: true }]); // Q2: existing tools
		dbModule._c.limit.mockResolvedValueOnce([fakeSseServer]);
		vi.mocked(listRemoteMcpTools).mockResolvedValueOnce([
			{ name: "search", description: "Search" },
		] as never);

		await syncMcpTools("srv-1", "ws-1", "user-1");

		// Check the insert values included requireApproval=true for "search"
		expect(dbModule._tx.values).toHaveBeenCalled();
		const insertedTools = dbModule._tx.values.mock.calls[0][0];
		const searchTool = (
			insertedTools as Array<{ name: string; requireApproval: boolean }>
		).find((t) => t.name === "search");
		expect(searchTool?.requireApproval).toBe(true);
	});
});

// ─── testMcpConnection ────────────────────────────────────────────────

describe("testMcpConnection", () => {
	it("throws when server not found", async () => {
		await expect(testMcpConnection("srv-1", "ws-1", "user-1")).rejects.toThrow(
			"MCP server not found",
		);
	});

	it("returns manual status for stdio transport", async () => {
		dbModule._c.limit.mockResolvedValueOnce([fakeStdioServer]);

		const result = await testMcpConnection("srv-2", "ws-1", "user-1");
		expect(result.status).toBe("manual");
	});

	it("returns healthy with tool count message", async () => {
		dbModule._c.limit.mockResolvedValueOnce([fakeSseServer]);
		vi.mocked(listRemoteMcpTools).mockResolvedValueOnce([
			{ name: "search" },
		] as never);

		const result = await testMcpConnection("srv-1", "ws-1", "user-1");
		expect(result.status).toBe("healthy");
		expect(result.message).toContain("1 tools available");
	});

	it("returns healthy with no-tools message", async () => {
		dbModule._c.limit.mockResolvedValueOnce([fakeSseServer]);
		vi.mocked(listRemoteMcpTools).mockResolvedValueOnce([]);

		const result = await testMcpConnection("srv-1", "ws-1", "user-1");
		expect(result.status).toBe("healthy");
		expect(result.message).toContain("no tools returned");
	});

	it("returns unhealthy status when connection fails", async () => {
		dbModule._c.limit.mockResolvedValueOnce([fakeSseServer]);
		vi.mocked(listRemoteMcpTools).mockRejectedValueOnce(new Error("Timeout"));

		const result = await testMcpConnection("srv-1", "ws-1", "user-1");
		expect(result.status).toBe("unhealthy");
		expect(result.message).toBe("Timeout");
	});
});
