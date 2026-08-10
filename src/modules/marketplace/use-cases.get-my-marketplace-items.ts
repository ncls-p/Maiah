import { audit } from "@/server/domain/services/audit";
import { authorization } from "@/server/domain/services/authorization";
import { db } from "@/server/infrastructure/db";
import { listDirectlyBoundResourceIds } from "@/server/infrastructure/db/access-resource-repository";
import { marketplaceItems } from "@/server/infrastructure/db/schema";
import { desc, eq, inArray, or } from "drizzle-orm";
import { canManageMarketplaceItem } from "./use-cases.marketplace-visibility";

export async function getMyMarketplaceItems(userId: string) {
  const directlyBoundIds = await listDirectlyBoundResourceIds(
    userId,
    "marketplace_item",
  );
  const directlyAccessibleIds = (
    await Promise.all(
      directlyBoundIds.map(async (itemId) => ({
        itemId,
        granted: await authorization.hasPermission(
          { principalType: "user", principalId: userId },
          "marketplaceItems.publish",
          "marketplace_item",
          itemId,
        ),
      })),
    )
  )
    .filter(({ granted }) => granted)
    .map(({ itemId }) => itemId);
  const visibleItemCondition = directlyAccessibleIds.length
    ? or(
        eq(marketplaceItems.publisherUserId, userId),
        inArray(marketplaceItems.id, directlyAccessibleIds),
      )
    : eq(marketplaceItems.publisherUserId, userId);
  return db
    .select()
    .from(marketplaceItems)
    .where(visibleItemCondition)
    .orderBy(desc(marketplaceItems.updatedAt));
}

// ─── Feature / Unfeature (Admin) ───────────────────────────────────────

export async function featureMarketplaceItem(input: {
  itemId: string;
  adminUserId: string;
  order?: number;
}) {
  const [item] = await db
    .select()
    .from(marketplaceItems)
    .where(eq(marketplaceItems.id, input.itemId))
    .limit(1);
  if (!item) throw new Error("Marketplace item not found");

  const [updated] = await db
    .update(marketplaceItems)
    .set({
      isFeatured: true,
      featuredOrder: input.order,
      featuredAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(marketplaceItems.id, input.itemId))
    .returning();

  await audit.emit({
    workspaceId: item.publisherWorkspaceId ?? undefined,
    actorPrincipalType: "user",
    actorPrincipalId: input.adminUserId,
    action: "marketplace.featured",
    resourceType: "marketplace_item",
    resourceId: input.itemId,
    outcome: "success",
    metadata: { order: input.order },
  });

  return updated;
}

export async function unfeatureMarketplaceItem(input: {
  itemId: string;
  adminUserId: string;
}) {
  const [item] = await db
    .select()
    .from(marketplaceItems)
    .where(eq(marketplaceItems.id, input.itemId))
    .limit(1);
  if (!item) throw new Error("Marketplace item not found");

  const [updated] = await db
    .update(marketplaceItems)
    .set({
      isFeatured: false,
      featuredOrder: null,
      featuredAt: null,
      updatedAt: new Date(),
    })
    .where(eq(marketplaceItems.id, input.itemId))
    .returning();

  await audit.emit({
    workspaceId: item.publisherWorkspaceId ?? undefined,
    actorPrincipalType: "user",
    actorPrincipalId: input.adminUserId,
    action: "marketplace.unfeatured",
    resourceType: "marketplace_item",
    resourceId: input.itemId,
    outcome: "success",
  });

  return updated;
}

// ─── Update item ───────────────────────────────────────────────────────

export async function updateMarketplaceItem(input: {
  itemId: string;
  userId: string;
  name?: string;
  description?: string;
  tags?: string[];
}) {
  const [item] = await db
    .select()
    .from(marketplaceItems)
    .where(eq(marketplaceItems.id, input.itemId))
    .limit(1);
  if (!item) throw new Error("Marketplace item not found");
  if (!(await canManageMarketplaceItem(item, input.userId)))
    throw new Error("Not authorized to update this item");

  const updates: Partial<typeof marketplaceItems.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (input.name !== undefined) updates.name = input.name;
  if (input.description !== undefined) updates.description = input.description;
  if (input.tags !== undefined) updates.tagsJson = input.tags;

  const [updated] = await db
    .update(marketplaceItems)
    .set(updates)
    .where(eq(marketplaceItems.id, input.itemId))
    .returning();

  return updated;
}

// ─── Delete item ───────────────────────────────────────────────────────

export async function deleteMarketplaceItem(itemId: string, userId: string) {
  const [item] = await db
    .select()
    .from(marketplaceItems)
    .where(eq(marketplaceItems.id, itemId))
    .limit(1);
  if (!item) throw new Error("Marketplace item not found");
  if (!(await canManageMarketplaceItem(item, userId)))
    throw new Error("Not authorized to delete this item");

  const [updated] = await db
    .update(marketplaceItems)
    .set({ status: "archived", updatedAt: new Date() })
    .where(eq(marketplaceItems.id, itemId))
    .returning();

  await audit.emit({
    workspaceId: item.publisherWorkspaceId ?? undefined,
    actorPrincipalType: "user",
    actorPrincipalId: userId,
    action: "marketplace.deleted",
    resourceType: "marketplace_item",
    resourceId: itemId,
    outcome: "success",
  });

  return updated;
}
