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
import { dbModule, ids, item, published, resetChain } from "./marketplace-use-cases-extra.test.helper-mocks";


describe("marketplace item management", () => {
	it("allows a delegated resource manager to update an item", async () => {
		vi.mocked(authorization.hasPermission).mockResolvedValueOnce(true);
		dbModule._c.limit.mockResolvedValueOnce([published]);
		dbModule._c.returning.mockResolvedValueOnce([
			{ id: "item-1", name: "Delegated update" },
		]);

		await expect(
			updateMarketplaceItem({
				itemId: "item-1",
				userId: ids.otherUserId,
				name: "Delegated update",
			}),
		).resolves.toMatchObject({ name: "Delegated update" });
		expect(authorization.hasPermission).toHaveBeenCalledWith(
			{ principalType: "user", principalId: ids.otherUserId },
			"marketplaceItems.publish",
			"marketplace_item",
			"item-1",
		);
	});

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
