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
import { Chain, dbModule, helperMocks, ids, published, resetChain } from "./marketplace-use-cases-extra.test.helper-mocks";


describe("marketplace installation", () => {
	it("installs skill, custom tool, MCP preset, and agent manifests", async () => {
		async function runInstall(manifest: Record<string, unknown>) {
			resetChain(dbModule._c);
			resetChain(dbModule._tx);
			dbModule.db.select.mockReturnValue(dbModule._c);
			dbModule.db.transaction.mockImplementation(
				(cb: (tx: Chain) => Promise<unknown>) => cb(dbModule._tx),
			);
			dbModule._c.limit
				.mockResolvedValueOnce([
					{ ...published, status: "published", visibility: "public" },
				])
				.mockResolvedValueOnce([
					{ id: "version-1", version: "1", manifestJson: manifest },
				]);
			dbModule._tx.returning
				.mockResolvedValueOnce([{ id: "installed-skill" }])
				.mockResolvedValueOnce([{ id: "install-1" }]);
			return installMarketplaceItem({
				workspaceId: ids.workspaceId,
				userId: ids.otherUserId,
				itemId: "item-1",
			});
		}
		await expect(
			runInstall({
				type: "skill",
				name: "Skill",
				skill: { markdownFiles: [] },
			}),
		).resolves.toMatchObject({
			install: { id: "install-1" },
			skill: { id: "installed-skill" },
		});
		await expect(
			runInstall({
				type: "custom_tool",
				name: "Tool",
				tool: {
					requiresCredentials: true,
					secretsIncluded: true,
					encryptedCredentialRefs: [{ encryptedPayload: "ciphertext" }],
				},
			}),
		).resolves.toMatchObject({ custom_tool: { id: "installed-tool" } });
		expect(helperMocks.installCustomTool).toHaveBeenLastCalledWith(
			dbModule._tx,
			expect.objectContaining({
				manifest: expect.objectContaining({
					tool: expect.not.objectContaining({
						secretsIncluded: expect.anything(),
						encryptedCredentialRefs: expect.anything(),
					}),
				}),
			}),
		);
		await expect(
			runInstall({ type: "mcp_preset", name: "Preset", preset: { tools: [] } }),
		).resolves.toMatchObject({ mcp_preset: { id: "installed-server" } });
		await expect(
			runInstall({ type: "agent", name: "Agent", agent: {} }),
		).resolves.toMatchObject({ agent: { id: "installed-agent" } });
	});

	it("rejects unavailable installs, missing versions, and unsupported manifest types", async () => {
		dbModule._c.limit.mockResolvedValueOnce([]);
		await expect(
			installMarketplaceItem({
				workspaceId: ids.workspaceId,
				userId: ids.userId,
				itemId: "missing",
			}),
		).rejects.toThrow("Marketplace item not found");
		expect(logHandledError).toHaveBeenCalled();

		resetChain(dbModule._c);
		dbModule.db.select.mockReturnValue(dbModule._c);
		dbModule._c.limit.mockResolvedValueOnce([
			{ ...published, status: "suspended" },
		]);
		await expect(
			installMarketplaceItem({
				workspaceId: ids.workspaceId,
				userId: ids.otherUserId,
				itemId: "item-1",
			}),
		).rejects.toThrow("Marketplace item not available");

		resetChain(dbModule._c);
		dbModule.db.select.mockReturnValue(dbModule._c);
		dbModule._c.limit
			.mockResolvedValueOnce([published])
			.mockResolvedValueOnce([]);
		await expect(
			installMarketplaceItem({
				workspaceId: ids.workspaceId,
				userId: ids.otherUserId,
				itemId: "item-1",
			}),
		).rejects.toThrow("Marketplace item has no version");

		resetChain(dbModule._c);
		resetChain(dbModule._tx);
		dbModule.db.select.mockReturnValue(dbModule._c);
		dbModule.db.transaction.mockImplementation(
			(cb: (tx: Chain) => Promise<unknown>) => cb(dbModule._tx),
		);
		dbModule._c.limit
			.mockResolvedValueOnce([published])
			.mockResolvedValueOnce([
				{ id: "version-1", version: "1", manifestJson: { type: "weird" } },
			]);
		await expect(
			installMarketplaceItem({
				workspaceId: ids.workspaceId,
				userId: ids.otherUserId,
				itemId: "item-1",
			}),
		).rejects.toThrow("Unsupported marketplace type");
	});
});
