import { beforeEach, describe, expect, it, vi } from "vitest";

const helperMocks = vi.hoisted(() => ({
	upsertMarketplaceDraft: vi.fn(async (input: unknown) => ({ draft: input })),
	buildAgentManifest: vi.fn(async () => ({
		type: "agent",
		name: "Agent",
		agent: {},
	})),
	buildCustomToolManifest: vi.fn(async () => ({
		type: "custom_tool",
		name: "Tool",
		tool: {},
	})),
	buildMcpPresetManifest: vi.fn(() => ({
		type: "mcp_preset",
		name: "Preset",
		preset: { tools: [] },
	})),
	buildSkillManifest: vi.fn(() => ({
		type: "skill",
		name: "Skill",
		skill: { markdownFiles: [] },
	})),
	installAgentManifest: vi.fn(async () => ({ id: "installed-agent" })),
	installCustomTool: vi.fn(async () => ({
		tool: { id: "installed-tool" },
		requiresCredentials: false,
	})),
	installMcpPreset: vi.fn(async () => ({
		server: { id: "installed-server" },
		requiresCredentials: true,
	})),
	installPostInstallFlags: vi.fn(() => ({ requiresCredentials: false })),
}));

vi.mock("@/modules/marketplace/draft-helpers", () => ({
	upsertMarketplaceDraft: helperMocks.upsertMarketplaceDraft,
}));
vi.mock("@/modules/marketplace/manifest-builders", () => ({
	buildAgentManifest: helperMocks.buildAgentManifest,
	buildCustomToolManifest: helperMocks.buildCustomToolManifest,
	buildMcpPresetManifest: helperMocks.buildMcpPresetManifest,
	buildSkillManifest: helperMocks.buildSkillManifest,
}));
vi.mock("@/modules/marketplace/install-helpers", () => ({
	installAgentManifest: helperMocks.installAgentManifest,
	installCustomTool: helperMocks.installCustomTool,
	installMcpPreset: helperMocks.installMcpPreset,
	installPostInstallFlags: helperMocks.installPostInstallFlags,
}));
vi.mock("@/server/domain/services/audit", () => ({
	audit: { emit: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock("@/lib/logger", () => ({ logHandledError: vi.fn() }));

type Chain = {
	select: ReturnType<typeof vi.fn>;
	insert: ReturnType<typeof vi.fn>;
	update: ReturnType<typeof vi.fn>;
	delete: ReturnType<typeof vi.fn>;
	from: ReturnType<typeof vi.fn>;
	innerJoin: ReturnType<typeof vi.fn>;
	where: ReturnType<typeof vi.fn>;
	orderBy: ReturnType<typeof vi.fn>;
	limit: ReturnType<typeof vi.fn>;
	values: ReturnType<typeof vi.fn>;
	set: ReturnType<typeof vi.fn>;
	returning: ReturnType<typeof vi.fn>;
};
function makeChain(): Chain {
	const c = {} as Chain;
	for (const key of [
		"select",
		"insert",
		"update",
		"delete",
		"from",
		"innerJoin",
		"where",
		"orderBy",
		"values",
		"set",
	] as const)
		c[key] = vi.fn().mockReturnThis();
	c.limit = vi.fn().mockResolvedValue([]);
	c.returning = vi.fn().mockResolvedValue([]);
	return c;
}
type DbModule = {
	db: {
		select: ReturnType<typeof vi.fn>;
		insert: ReturnType<typeof vi.fn>;
		update: ReturnType<typeof vi.fn>;
		delete: ReturnType<typeof vi.fn>;
		transaction: ReturnType<typeof vi.fn>;
	};
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

import { logHandledError } from "@/lib/logger";
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

const dbModule = _dbModule as unknown as DbModule;
const ids = { workspaceId: "ws-1", userId: "user-1", otherUserId: "user-2" };
const item = {
	id: "item-1",
	publisherUserId: ids.userId,
	publisherWorkspaceId: ids.workspaceId,
	status: "draft",
	visibility: "private",
	latestVersionId: "version-1",
	tagsJson: ["old"],
	description: "Item",
};
const published = { ...item, status: "published", visibility: "public" };

function resetChain(chain: Chain) {
	for (const key of [
		"select",
		"insert",
		"update",
		"delete",
		"from",
		"innerJoin",
		"where",
		"orderBy",
		"values",
		"set",
	] as const)
		chain[key].mockReset().mockReturnThis();
	chain.limit.mockReset().mockResolvedValue([]);
	chain.returning.mockReset().mockResolvedValue([]);
}

beforeEach(() => {
	vi.clearAllMocks();
	resetChain(dbModule._c);
	resetChain(dbModule._tx);
	dbModule.db.select.mockReset().mockReturnValue(dbModule._c);
	dbModule.db.insert.mockReset().mockReturnValue(dbModule._c);
	dbModule.db.update.mockReset().mockReturnValue(dbModule._c);
	dbModule.db.delete.mockReset().mockReturnValue(dbModule._c);
	dbModule.db.transaction
		.mockReset()
		.mockImplementation((cb: (tx: Chain) => Promise<unknown>) =>
			cb(dbModule._tx),
		);
	helperMocks.installPostInstallFlags.mockReturnValue({
		requiresCredentials: false,
	});
});

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

describe("marketplace item management", () => {
	it("publishes, updates, deletes, features, unfeatures, and moderates items", async () => {
		dbModule._c.limit
			.mockResolvedValueOnce([item])
			.mockResolvedValueOnce([
				{ id: "version-1", manifestJson: { type: "skill", skill: {} } },
			]);
		dbModule._c.returning.mockResolvedValueOnce([
			{ ...item, status: "published" },
		]);
		await expect(
			publishMarketplaceItem("item-1", ids.userId, {
				visibility: "public",
				tags: ["new"],
			}),
		).resolves.toMatchObject({ status: "published" });

		for (const fn of [
			featureMarketplaceItem,
			unfeatureMarketplaceItem,
		] as const) {
			resetChain(dbModule._c);
			dbModule.db.select.mockReturnValue(dbModule._c);
			dbModule.db.update.mockReturnValue(dbModule._c);
			dbModule._c.limit.mockResolvedValueOnce([published]);
			dbModule._c.returning.mockResolvedValueOnce([
				{ id: "item-1", updated: true },
			]);
			await expect(
				fn === featureMarketplaceItem
					? fn({ itemId: "item-1", adminUserId: "admin", order: 2 })
					: fn({ itemId: "item-1", adminUserId: "admin" }),
			).resolves.toMatchObject({ updated: true });
		}

		resetChain(dbModule._c);
		dbModule.db.select.mockReturnValue(dbModule._c);
		dbModule.db.update.mockReturnValue(dbModule._c);
		dbModule._c.limit.mockResolvedValueOnce([published]);
		dbModule._c.returning.mockResolvedValueOnce([
			{ id: "item-1", name: "New" },
		]);
		await expect(
			updateMarketplaceItem({
				itemId: "item-1",
				userId: ids.userId,
				name: "New",
				tags: ["tag"],
			}),
		).resolves.toMatchObject({ name: "New" });

		resetChain(dbModule._c);
		dbModule.db.select.mockReturnValue(dbModule._c);
		dbModule.db.update.mockReturnValue(dbModule._c);
		dbModule._c.limit.mockResolvedValueOnce([published]);
		dbModule._c.returning.mockResolvedValueOnce([
			{ id: "item-1", status: "archived" },
		]);
		await expect(
			deleteMarketplaceItem("item-1", ids.userId),
		).resolves.toMatchObject({ status: "archived" });

		resetChain(dbModule._c);
		dbModule.db.select.mockReturnValue(dbModule._c);
		dbModule.db.update.mockReturnValue(dbModule._c);
		dbModule._c.limit.mockResolvedValueOnce([published]);
		dbModule._c.returning.mockResolvedValueOnce([
			{ id: "item-1", status: "suspended" },
		]);
		await expect(
			adminModerateItem({
				itemId: "item-1",
				adminUserId: "admin",
				action: "suspend",
			}),
		).resolves.toMatchObject({ status: "suspended" });
	});

	it("shares, unshares, and lists shared/owned items", async () => {
		dbModule._c.limit
			.mockResolvedValueOnce([published])
			.mockResolvedValueOnce([{ id: ids.otherUserId, name: "Target" }]);
		dbModule._c.returning.mockResolvedValueOnce([{ id: "share-1" }]);
		await expect(
			shareMarketplaceItem({
				itemId: "item-1",
				userId: ids.userId,
				targetUserId: ids.otherUserId,
			}),
		).resolves.toEqual({ id: "share-1" });

		resetChain(dbModule._c);
		dbModule.db.select.mockReturnValue(dbModule._c);
		dbModule.db.delete.mockReturnValue(dbModule._c);
		dbModule._c.limit.mockResolvedValueOnce([published]);
		await expect(
			unshareMarketplaceItem({
				itemId: "item-1",
				userId: ids.userId,
				targetUserId: ids.otherUserId,
			}),
		).resolves.toBeUndefined();
		expect(dbModule.db.delete).toHaveBeenCalled();

		resetChain(dbModule._c);
		dbModule.db.select.mockReturnValue(dbModule._c);
		dbModule._c.orderBy.mockResolvedValueOnce([
			{ item: published, sharedAt: new Date() },
		]);
		await expect(getSharedWithMe(ids.userId)).resolves.toHaveLength(1);

		resetChain(dbModule._c);
		dbModule.db.select.mockReturnValue(dbModule._c);
		dbModule._c.orderBy.mockResolvedValueOnce([published]);
		await expect(getMyMarketplaceItems(ids.userId)).resolves.toEqual([
			published,
		]);
	});

	it("loads item detail with owner shares and install permission", async () => {
		dbModule._c.limit
			.mockResolvedValueOnce([published])
			.mockResolvedValueOnce([
				{
					id: "version-1",
					version: "1",
					manifestJson: { type: "skill" },
					createdAt: new Date(),
				},
			])
			.mockResolvedValueOnce([
				{ id: ids.userId, name: "Owner", email: "owner@test" },
			]);
		dbModule._c.where
			.mockReturnValueOnce(dbModule._c)
			.mockResolvedValueOnce([{ id: "share-1" }])
			.mockReturnValueOnce(dbModule._c)
			.mockReturnValueOnce(dbModule._c)
			.mockResolvedValueOnce([
				{
					userId: ids.otherUserId,
					name: "Target",
					email: "t@test",
					sharedAt: new Date(),
				},
			]);

		const detail = await getMarketplaceItemDetail("item-1", ids.userId);
		expect(detail).toMatchObject({
			id: "item-1",
			isOwner: true,
			canInstall: true,
		});
		expect(detail?.shares).toHaveLength(1);
	});
});

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
