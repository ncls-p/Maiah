import {
installAgentManifest,
installPostInstallFlags
} from "@/modules/marketplace/install-helpers";
import { describe,expect,it } from "vitest";
import { customToolManifest,mcpManifest,tx } from "./marketplace-install-helpers.test.tx";


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
				tool: { requiresCredentials: false },
			}),
		).toEqual({ requiresCredentials: false });
	});
});
