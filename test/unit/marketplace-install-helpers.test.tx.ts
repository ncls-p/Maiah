import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	installAgentManifest,
	installCustomTool,
	installMcpPreset,
	installPostInstallFlags,
} from "@/modules/marketplace/install-helpers";

type TxChain = {
	select: ReturnType<typeof vi.fn>;
	insert: ReturnType<typeof vi.fn>;
	update: ReturnType<typeof vi.fn>;
	from: ReturnType<typeof vi.fn>;
	where: ReturnType<typeof vi.fn>;
	limit: ReturnType<typeof vi.fn>;
	values: ReturnType<typeof vi.fn>;
	set: ReturnType<typeof vi.fn>;
	returning: ReturnType<typeof vi.fn>;
};

function makeTx(): TxChain {
	const tx = {} as TxChain;
	for (const key of [
		"select",
		"insert",
		"update",
		"from",
		"where",
		"values",
		"set",
	] as const) {
		tx[key] = vi.fn().mockReturnThis();
	}
	tx.limit = vi.fn().mockResolvedValue([]);
	tx.returning = vi.fn().mockResolvedValue([]);
	return tx;
}

export let tx: TxChain;

beforeEach(() => {
	tx = makeTx();
});

export const mcpManifest = {
	type: "mcp_preset" as const,
	name: "Search preset",
	description: "Search tools",
	preset: {
		scope: "server" as const,
		serverName: "Search MCP",
		transport: "sse" as const,
		url: "https://mcp.test/sse",
		enabled: true,
		requireApproval: false,
		healthStatus: "healthy",
		requiresCredentials: true,
		credentialSchema: [
			{
				key: "header:Authorization",
				label: "Header: Authorization",
				required: true,
			},
		],
		tools: [
			{
				name: "search",
				description: "Search",
				inputSchema: { type: "object" },
				outputSchema: null,
				enabled: true,
				requireApproval: true,
			},
		],
	},
};

export const customToolManifest = {
	type: "custom_tool" as const,
	name: "Discord notifier",
	description: "Notify Discord",
	tool: {
		status: "workflow_created" as const,
		inputSchema: { type: "object" },
		outputSchema: { type: "object" },
		n8nWorkflowId: "wf-1",
		n8nWorkflowUrl: "https://n8n.test/workflow/wf-1",
		metadata: { source: "builder" },
		requiresCredentials: true,
	},
};

describe("installMcpPreset", () => {
	it("installs a server and its tools, flagging missing credentials", async () => {
		tx.returning.mockResolvedValueOnce([
			{ id: "server-1", name: "Search MCP" },
		]);

		const result = await installMcpPreset(tx as never, {
			workspaceId: "ws-1",
			userId: "user-1",
			manifest: mcpManifest,
		});

		expect(result.server).toEqual({ id: "server-1", name: "Search MCP" });
		expect(result.requiresCredentials).toBe(true);
		expect(tx.insert).toHaveBeenCalledTimes(2);
		expect(tx.values).toHaveBeenCalledWith(
			expect.objectContaining({
				name: "Search MCP",
				healthStatus: "unknown",
			}),
		);
		expect(tx.values).toHaveBeenCalledWith([
			expect.objectContaining({
				mcpServerId: "server-1",
				name: "search",
				requireApproval: true,
			}),
		]);
	});

	it("uses the marketplace item name when installing a single tool preset", async () => {
		tx.returning.mockResolvedValueOnce([
			{ id: "server-2", name: "Single tool" },
		]);

		await installMcpPreset(tx as never, {
			workspaceId: "ws-1",
			userId: "user-1",
			manifest: {
				...mcpManifest,
				name: "Single tool",
				preset: { ...mcpManifest.preset, scope: "tool", tools: [] },
			},
		});

		expect(tx.values).toHaveBeenCalledWith(
			expect.objectContaining({ name: "Single tool" }),
		);
		expect(tx.insert).toHaveBeenCalledTimes(1);
	});
});

describe("installCustomTool", () => {
	it("installs custom tools without transferring credentials", async () => {
		tx.returning.mockResolvedValueOnce([
			{ id: "custom-1", name: "Discord notifier" },
		]);

		const result = await installCustomTool(tx as never, {
			workspaceId: "ws-1",
			userId: "user-1",
			manifest: customToolManifest,
		});

		expect(result.requiresCredentials).toBe(true);
		expect(result.tool).toEqual({ id: "custom-1", name: "Discord notifier" });
		expect(tx.insert).toHaveBeenCalledTimes(1);
		expect(tx.values).toHaveBeenCalledWith(
			expect.objectContaining({
				name: "Discord notifier",
				status: "workflow_created",
				n8nWorkflowId: "wf-1",
			}),
		);
	});
});
