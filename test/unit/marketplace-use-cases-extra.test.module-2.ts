import { beforeEach, describe, expect, it, vi } from "vitest";

import { logHandledError } from "@/lib/logger";
import { authorization } from "@/server/domain/services/authorization";
import * as _dbModule from "@/server/infrastructure/db";
import {
	adminModerateItem,
	createCustomToolMarketplaceDraft,
	createMarketplaceDraft,
	createMcpServerMarketplaceDraft,
	createMcpToolMarketplaceDraft,
	createSkillMarketplaceDraft,
	deleteMarketplaceItem,
	featureMarketplaceItem,
	getMarketplaceItemDetail,
	getMyMarketplaceItems,
	getSharedWithMe,
	installMarketplaceItem,
	publishAgentDraft,
	publishMarketplaceItem,
	shareMarketplaceItem,
	unfeatureMarketplaceItem,
	unshareMarketplaceItem,
	updateMarketplaceItem,
} from "@/modules/marketplace/use-cases";
import { dbModule, helperMocks, ids, resetChain } from "./marketplace-use-cases-extra.test.helper-mocks";


describe("marketplace draft creation", () => {
	it("creates and publishes agent drafts for owned agents", async () => {
		dbModule._c.limit.mockResolvedValueOnce([
			{
				id: "agent-1",
				name: "Agent",
				description: "Desc",
				createdById: ids.userId,
			},
		]);
		await publishAgentDraft({
			workspaceId: ids.workspaceId,
			userId: ids.userId,
			agentId: "agent-1",
			version: "1.0.0",
		});
		expect(helperMocks.buildAgentManifest).toHaveBeenCalledWith(
			"agent-1",
			ids.workspaceId,
			"Agent",
			"Desc",
		);
		expect(helperMocks.upsertMarketplaceDraft).toHaveBeenCalledWith(
			expect.objectContaining({ type: "agent", status: "published" }),
		);

		resetChain(dbModule._c);
		dbModule.db.select.mockReturnValue(dbModule._c);
		dbModule._c.limit.mockResolvedValueOnce([
			{
				id: "agent-1",
				name: "Agent",
				description: null,
				createdById: ids.userId,
			},
		]);
		await createMarketplaceDraft({
			workspaceId: ids.workspaceId,
			userId: ids.userId,
			agentId: "agent-1",
			version: "draft",
		});
		expect(helperMocks.upsertMarketplaceDraft).toHaveBeenCalledWith(
			expect.objectContaining({
				sourceResourceType: "agent",
				version: "draft",
			}),
		);
	});

	it("creates skill, custom tool, MCP server, and MCP tool drafts", async () => {
		dbModule._c.limit.mockResolvedValueOnce([
			{
				id: "skill-1",
				name: "skill",
				description: "Skill",
				createdById: ids.userId,
			},
		]);
		await createSkillMarketplaceDraft({
			workspaceId: ids.workspaceId,
			userId: ids.userId,
			skillId: "skill-1",
			version: "1",
		});
		expect(helperMocks.buildSkillManifest).toHaveBeenCalled();

		resetChain(dbModule._c);
		dbModule.db.select.mockReturnValue(dbModule._c);
		dbModule._c.limit.mockResolvedValueOnce([
			{
				id: "tool-1",
				name: "Tool",
				description: "Tool",
				createdById: ids.userId,
			},
		]);
		await createCustomToolMarketplaceDraft({
			workspaceId: ids.workspaceId,
			userId: ids.userId,
			customToolId: "tool-1",
			version: "1",
		});
		expect(helperMocks.buildCustomToolManifest).toHaveBeenCalled();

		resetChain(dbModule._c);
		dbModule.db.select.mockReturnValue(dbModule._c);
		dbModule._c.limit.mockResolvedValueOnce([
			{ id: "server-1", name: "Server", createdById: ids.userId },
		]);
		dbModule._c.where
			.mockReturnValueOnce(dbModule._c)
			.mockResolvedValueOnce([{ id: "mcp-tool-1", name: "search" }]);
		await createMcpServerMarketplaceDraft({
			workspaceId: ids.workspaceId,
			userId: ids.userId,
			mcpServerId: "server-1",
			version: "1",
		});
		expect(helperMocks.buildMcpPresetManifest).toHaveBeenCalledWith(
			"Server",
			undefined,
			expect.any(Object),
			[{ id: "mcp-tool-1", name: "search" }],
			"server",
		);

		resetChain(dbModule._c);
		dbModule.db.select.mockReturnValue(dbModule._c);
		dbModule._c.limit
			.mockResolvedValueOnce([
				{
					id: "mcp-tool-1",
					name: "search",
					description: "Search",
					mcpServerId: "server-1",
				},
			])
			.mockResolvedValueOnce([
				{ id: "server-1", name: "Server", createdById: ids.userId },
			]);
		await createMcpToolMarketplaceDraft({
			workspaceId: ids.workspaceId,
			userId: ids.userId,
			mcpToolId: "mcp-tool-1",
			version: "1",
		});
		expect(helperMocks.buildMcpPresetManifest).toHaveBeenLastCalledWith(
			"Server — search",
			"Search",
			expect.any(Object),
			[expect.objectContaining({ name: "search" })],
			"tool",
		);
	});

	it("rejects draft creation for missing or unowned resources", async () => {
		dbModule._c.limit.mockResolvedValueOnce([]);
		await expect(
			createSkillMarketplaceDraft({
				workspaceId: ids.workspaceId,
				userId: ids.userId,
				skillId: "missing",
				version: "1",
			}),
		).rejects.toThrow("Skill not found");
		resetChain(dbModule._c);
		dbModule.db.select.mockReturnValue(dbModule._c);
		dbModule._c.limit.mockResolvedValueOnce([
			{ id: "agent-1", createdById: ids.otherUserId },
		]);
		await expect(
			createMarketplaceDraft({
				workspaceId: ids.workspaceId,
				userId: ids.userId,
				agentId: "agent-1",
				version: "1",
			}),
		).rejects.toThrow("Agent not found");
	});
});
