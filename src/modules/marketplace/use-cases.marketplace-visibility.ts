import { authorization } from "@/server/domain/services/authorization";
import { db } from "@/server/infrastructure/db";
import {
  marketplaceItems,
  marketplaceItemShares,
  marketplaceItemTypeEnum,
} from "@/server/infrastructure/db/schema";
import { and, desc, eq, inArray, ilike, or, sql } from "drizzle-orm";

export type MarketplaceVisibility = "public" | "private";

export type MarketplaceItemType =
  (typeof marketplaceItemTypeEnum.enumValues)[number];

export async function canManageMarketplaceItem(
  item: NonNullable<Awaited<ReturnType<typeof getMarketplaceItem>>>,
  userId: string,
) {
  if (item.publisherUserId === userId) return true;
  if (!item.publisherWorkspaceId) return false;
  return authorization.hasPermission(
    { principalType: "user", principalId: userId },
    "marketplaceItems.publish",
    "marketplace_item",
    item.id,
  );
}

// ─── List / Search ─────────────────────────────────────────────────────

export function listMarketplaceItems(input: {
  userId?: string;
  search?: string;
  type?: MarketplaceItemType[];
  tags?: string[];
  featuredOnly?: boolean;
  sortBy?: "featured" | "newest" | "downloads" | "rating";
  status?: string;
}) {
  const conditions: unknown[] = [];

  if (input.status) {
    conditions.push(eq(marketplaceItems.status, input.status as never));
  } else {
    conditions.push(eq(marketplaceItems.status, "published"));
    if (input.userId) {
      const sharedSubquery = db
        .select({ itemId: marketplaceItemShares.itemId })
        .from(marketplaceItemShares)
        .where(eq(marketplaceItemShares.sharedWithUserId, input.userId));
      conditions.push(
        or(
          eq(marketplaceItems.visibility, "public"),
          eq(marketplaceItems.publisherUserId, input.userId),
          sql`${marketplaceItems.id} IN ${sharedSubquery}`,
        ),
      );
    } else {
      conditions.push(eq(marketplaceItems.visibility, "public"));
    }
  }

  if (input.search) {
    const searchPattern = `%${input.search}%`;
    conditions.push(
      or(
        ilike(marketplaceItems.name, searchPattern),
        ilike(marketplaceItems.description, searchPattern),
      ),
    );
  }

  if (input.type && input.type.length > 0) {
    // Bound values via inArray — user input is never interpolated into SQL.
    conditions.push(inArray(marketplaceItems.type, input.type));
  }

  if (input.featuredOnly) {
    conditions.push(eq(marketplaceItems.isFeatured, true));
  }

  // Build query — use a helper to chain conditionally
  const buildQuery = () => {
    let q = db.select().from(marketplaceItems);
    if (conditions.length > 0) {
      q = q.where(and(...(conditions as Parameters<typeof and>))) as typeof q;
    }
    switch (input.sortBy) {
      case "featured":
        return q.orderBy(
          desc(marketplaceItems.isFeatured),
          desc(marketplaceItems.featuredOrder),
          desc(marketplaceItems.totalDownloads),
        ) as typeof q;
      case "newest":
        return q.orderBy(desc(marketplaceItems.publishedAt)) as typeof q;
      case "downloads":
        return q.orderBy(desc(marketplaceItems.totalDownloads)) as typeof q;
      case "rating":
        return q.orderBy(desc(marketplaceItems.ratingAverage)) as typeof q;
      default:
        return q.orderBy(
          desc(marketplaceItems.isFeatured),
          desc(marketplaceItems.featuredOrder),
          desc(marketplaceItems.totalDownloads),
          desc(marketplaceItems.updatedAt),
        ) as typeof q;
    }
  };

  return buildQuery();
}

export async function getMarketplaceItem(itemId: string) {
  const [item] = await db
    .select()
    .from(marketplaceItems)
    .where(eq(marketplaceItems.id, itemId))
    .limit(1);
  return item ?? null;
}

export async function getMarketplaceItemWithShares(itemId: string) {
  const [item] = await db
    .select()
    .from(marketplaceItems)
    .where(eq(marketplaceItems.id, itemId))
    .limit(1);
  if (!item) return null;

  const shares = await db
    .select()
    .from(marketplaceItemShares)
    .where(eq(marketplaceItemShares.itemId, itemId));

  const shareCount = shares.length;

  return { ...item, shareCount };
}
