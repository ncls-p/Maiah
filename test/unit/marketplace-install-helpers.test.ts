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

let tx: TxChain;

beforeEach(() => {
	tx = makeTx();
});

const mcpManifest = {
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
		secretsIncluded: false,
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

const customToolManifest = {
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
		secretsIncluded: true,
		encryptedCredentialRefs: [
			{
				provider: "Discord",
				label: "Main webhook",
				n8nCredentialId: "cred-1",
				encryptedPayload: "encrypted",
				metadata: { fieldNames: ["webhookUrl"] },
			},
		],
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
	it("installs custom tools and bundled credential refs", async () => {
		tx.returning.mockResolvedValueOnce([
			{ id: "custom-1", name: "Discord notifier" },
		]);

		const result = await installCustomTool(tx as never, {
			workspaceId: "ws-1",
			userId: "user-1",
			manifest: customToolManifest,
		});

		expect(result.requiresCredentials).toBe(false);
		expect(result.tool).toEqual({ id: "custom-1", name: "Discord notifier" });
		expect(tx.insert).toHaveBeenCalledTimes(2);
		expect(tx.values).toHaveBeenCalledWith(
			expect.objectContaining({
				name: "Discord notifier",
				status: "workflow_created",
				n8nWorkflowId: "wf-1",
			}),
		);
		expect(tx.values).toHaveBeenCalledWith(
			expect.objectContaining({
				provider: "Discord",
				n8nCredentialId: "cred-1",
				encryptedPayload: "encrypted",
			}),
		);
	});
});

describe("installAgentManifest", () => {
	it("installs bundled resources, resolves provider/model IDs, and creates bindings", async () => {
		tx.returning
			.mockResolvedValueOnce([{ id: "skill-1" }])
			.mockResolvedValueOnce([{ id: "server-1", name: "Search MCP" }])
			.mockResolvedValueOnce([{ id: "custom-1", name: "Discord notifier" }])
			.mockResolvedValueOnce([{ id: "agent-1", name: "Installed Agent" }])
			.mockResolvedValueOnce([{ id: "version-1" }]);
		tx.limit
			.mockResolvedValueOnce([{ id: "mcp-tool-1" }])
			.mockResolvedValueOnce([{ id: "provider-local" }])
			.mockResolvedValueOnce([{ id: "model-local" }])
			.mockResolvedValueOnce([{ id: "kb-1" }]);

		const agent = await installAgentManifest(tx as never, {
			workspaceId: "ws-1",
			userId: "user-1",
			itemId: "item-1",
			versionId: "item-version-1",
			versionLabel: "1.0.0",
			manifest: {
				type: "agent",
				name: "Installed Agent",
				description: "Agent description",
				agent: {
					systemPrompt: "Help users",
					providerId: "provider-original",
					providerName: "Provider",
					modelId: "model-original",
					modelName: "Model",
					temperature: "0.3",
					topP: "0.9",
					maxOutputTokens: 4000,
					maxToolCalls: 6,
					toolChoice: "auto",
					generationSettings: { seed: 1 },
					responseFormat: { type: "text" },
					memoryPolicy: { enabled: true },
					guardrails: { blocked: [] },
					approvalPolicy: { mode: "auto" },
				},
				toolBindings: [
					{
						source: "builtin",
						ref: "web_search",
						requireApproval: false,
						riskLevel: "low",
					},
					{
						source: "mcp",
						ref: "Search MCP/search",
						requireApproval: true,
						riskLevel: "medium",
					},
					{
						source: "custom",
						ref: "Discord notifier",
						requireApproval: false,
						riskLevel: "low",
					},
				],
				skillBindings: [
					{
						ref: "Research",
						bundled: {
							markdownFiles: [{ path: "SKILL.md", content: "# Skill" }],
						},
					},
				],
				knowledgeBindings: [{ name: "Docs", description: "Docs KB" }],
				bundledResources: {
					skills: [
						{
							name: "Research",
							skill: {
								markdownFiles: [{ path: "SKILL.md", content: "# Skill" }],
							},
						},
					],
					mcpPresets: [mcpManifest],
					customTools: [customToolManifest],
				},
			} as never,
		});

		expect(agent).toEqual({ id: "agent-1", name: "Installed Agent" });
		expect(tx.update).toHaveBeenCalled();
		expect(tx.values).toHaveBeenCalledWith(
			expect.objectContaining({
				agentId: "agent-1",
				providerId: "provider-local",
				modelId: "model-local",
			}),
		);
		expect(tx.values).toHaveBeenCalledWith(
			expect.objectContaining({
				agentVersionId: "version-1",
				toolSource: "mcp",
				toolId: "mcp-tool-1",
			}),
		);
		expect(tx.values).toHaveBeenCalledWith(
			expect.objectContaining({
				agentVersionId: "version-1",
				skillId: "skill-1",
			}),
		);
		expect(tx.values).toHaveBeenCalledWith(
			expect.objectContaining({
				agentVersionId: "version-1",
				knowledgeBaseId: "kb-1",
			}),
		);
	});

	it("resolves existing referenced MCP tools, custom tools, and skills when resources are not bundled", async () => {
		tx.returning
			.mockResolvedValueOnce([{ id: "agent-2", name: "Reference Agent" }])
			.mockResolvedValueOnce([{ id: "version-2" }]);
		tx.limit
			.mockResolvedValueOnce([{ id: "server-existing" }])
			.mockResolvedValueOnce([{ id: "mcp-tool-existing" }])
			.mockResolvedValueOnce([{ id: "custom-existing" }])
			.mockResolvedValueOnce([{ id: "skill-existing" }])
			.mockResolvedValueOnce([]);

		const agent = await installAgentManifest(tx as never, {
			workspaceId: "ws-1",
			userId: "user-1",
			itemId: "item-2",
			versionId: "item-version-2",
			versionLabel: "2.0.0",
			manifest: {
				type: "agent",
				name: "Reference Agent",
				description: "Uses existing resources",
				agent: { modelId: "model-raw" },
				toolBindings: [
					{
						source: "mcp",
						ref: "Existing MCP/search",
						requireApproval: true,
						riskLevel: "medium",
					},
					{
						source: "custom",
						ref: "Existing Custom",
						requireApproval: false,
						riskLevel: "low",
					},
				],
				skillBindings: [{ ref: "Existing Skill" }],
				knowledgeBindings: [{ name: "Missing KB" }],
			} as never,
		});

		expect(agent).toEqual({ id: "agent-2", name: "Reference Agent" });
		expect(tx.values).toHaveBeenCalledWith(
			expect.objectContaining({
				agentVersionId: "version-2",
				toolSource: "mcp",
				toolId: "mcp-tool-existing",
			}),
		);
		expect(tx.values).toHaveBeenCalledWith(
			expect.objectContaining({
				agentVersionId: "version-2",
				toolSource: "custom",
				toolId: "custom-existing",
			}),
		);
		expect(tx.values).toHaveBeenCalledWith(
			expect.objectContaining({
				agentVersionId: "version-2",
				skillId: "skill-existing",
			}),
		);
	});
});

describe("installPostInstallFlags", () => {
	it("returns false for agents and custom tools without missing credentials", () => {
		expect(
			installPostInstallFlags({ type: "agent", name: "Agent", agent: {} }),
		).toEqual({
			requiresCredentials: false,
		});
		expect(
			installPostInstallFlags({
				type: "custom_tool",
				name: "Tool",
				tool: { requiresCredentials: false, secretsIncluded: false },
			}),
		).toEqual({ requiresCredentials: false });
	});
});
