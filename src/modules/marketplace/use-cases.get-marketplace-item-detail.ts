import { db } from "@/server/infrastructure/db";
import {
  marketplaceItemShares,
  marketplaceItemVersions,
  users,
} from "@/server/infrastructure/db/schema";
import { and, desc, eq } from "drizzle-orm";
import {
  prepareAgentMarketplaceDraft,
  upsertMarketplaceDraft,
} from "./draft-helpers";
import { sanitizeMarketplaceManifest } from "./manifest-sanitizer";
import {
  canManageMarketplaceItem,
  getMarketplaceItem,
  getMarketplaceItemWithShares,
  MarketplaceVisibility,
} from "./use-cases.marketplace-visibility";

export async function getMarketplaceItemDetail(
  itemId: string,
  userId?: string,
) {
  const item = await getMarketplaceItemWithShares(itemId);
  if (!item) return null;

  const latestVersion = await getLatestVersion(itemId);

  const [publisher] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
    })
    .from(users)
    .where(eq(users.id, item.publisherUserId))
    .limit(1);

  const shareRows = await db
    .select({
      userId: marketplaceItemShares.sharedWithUserId,
      sharedAt: marketplaceItemShares.sharedAt,
      name: users.name,
      email: users.email,
    })
    .from(marketplaceItemShares)
    .innerJoin(users, eq(users.id, marketplaceItemShares.sharedWithUserId))
    .where(eq(marketplaceItemShares.itemId, itemId));

  const isOwner = userId ? await canManageMarketplaceItem(item, userId) : false;
  const canInstall = userId
    ? await canUserInstallMarketplaceItem(item, userId)
    : item.status === "published" && item.visibility === "public";

  return {
    ...item,
    latestVersion: latestVersion
      ? {
          id: latestVersion.id,
          version: latestVersion.version,
          changelog: latestVersion.changelog,
          manifestJson: sanitizeMarketplaceManifest(latestVersion.manifestJson),
          compatibilityJson: latestVersion.compatibilityJson,
          createdAt: latestVersion.createdAt,
        }
      : null,
    publisher: publisher ?? null,
    shares: isOwner
      ? shareRows.map((s) => ({
          userId: s.userId,
          name: s.name,
          email: s.email,
          sharedAt: s.sharedAt,
        }))
      : [],
    isOwner,
    canInstall,
  };
}

export async function getLatestVersion(itemId: string) {
  const [version] = await db
    .select()
    .from(marketplaceItemVersions)
    .where(eq(marketplaceItemVersions.itemId, itemId))
    .orderBy(desc(marketplaceItemVersions.createdAt))
    .limit(1);
  return version ?? null;
}

async function userHasMarketplaceShare(itemId: string, userId: string) {
  const [share] = await db
    .select({ id: marketplaceItemShares.id })
    .from(marketplaceItemShares)
    .where(
      and(
        eq(marketplaceItemShares.itemId, itemId),
        eq(marketplaceItemShares.sharedWithUserId, userId),
      ),
    )
    .limit(1);
  return Boolean(share);
}

export async function canUserInstallMarketplaceItem(
  item: NonNullable<Awaited<ReturnType<typeof getMarketplaceItem>>>,
  userId: string,
) {
  const blockedStatuses = new Set(["suspended", "archived", "rejected"]);
  if (blockedStatuses.has(item.status)) return false;

  if (item.publisherUserId === userId) return true;

  if (item.status === "published" && item.visibility === "public") return true;

  if (await userHasMarketplaceShare(item.id, userId)) return true;

  if (item.status === "draft" || item.status === "published") {
    return false;
  }

  return false;
}

// ─── Create / Publish ──────────────────────────────────────────────────

export type DraftInputExtras = {
  changelog?: string;
  tags?: string[];
};

export async function publishAgentDraft(
  input: {
    workspaceId: string;
    userId: string;
    agentId: string;
    version: string;
    name?: string;
    description?: string;
    visibility?: MarketplaceVisibility;
  } & DraftInputExtras,
) {
  const { description, manifest, name } =
    await prepareAgentMarketplaceDraft(input);

  return upsertMarketplaceDraft({
    workspaceId: input.workspaceId,
    userId: input.userId,
    type: "agent",
    sourceResourceType: "agent",
    sourceResourceId: input.agentId,
    version: input.version,
    changelog: input.changelog ?? "Initial marketplace publish",
    name,
    description,
    visibility: input.visibility ?? "public",
    tags: input.tags,
    manifest,
    metadata: { agentId: input.agentId },
    status: "published",
    publishedAt: new Date(),
  });
}
