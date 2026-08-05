import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { logHandledError } from "@/lib/logger";
import { audit } from "@/server/domain/services/audit";
import { authorization } from "@/server/domain/services/authorization";
import { listDirectlyBoundResourceIds } from "@/server/infrastructure/db/access-resource-repository";
import { db } from "@/server/infrastructure/db";
import {
  agents,
  agentSkills,
  customTools,
  marketplaceInstalls,
  marketplaceItems,
  marketplaceItemVersions,
  marketplaceItemShares,
  mcpServers,
  mcpTools,
  users,
} from "@/server/infrastructure/db/schema";
import { upsertMarketplaceDraft } from "./draft-helpers";
import {
  installAgentManifest,
  installCustomTool,
  installMcpPreset,
  installPostInstallFlags,
} from "./install-helpers";
import {
  buildAgentManifest,
  buildCustomToolManifest,
  buildMcpPresetManifest,
  buildSkillManifest,
} from "./manifest-builders";
import { sanitizeMarketplaceManifest } from "./manifest-sanitizer";
import {
  MarketplaceVisibility,
  canManageMarketplaceItem,
  getMarketplaceItem,
  getMarketplaceItemWithShares,
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
  const [agent] = await db
    .select()
    .from(agents)
    .where(
      and(
        eq(agents.id, input.agentId),
        eq(agents.workspaceId, input.workspaceId),
      ),
    )
    .limit(1);
  if (!agent || agent.createdById !== input.userId) {
    throw new Error("Agent not found");
  }

  const name = input.name || agent.name;
  const manifest = await buildAgentManifest(
    input.agentId,
    input.workspaceId,
    name,
    input.description ?? agent.description,
  );

  return upsertMarketplaceDraft({
    workspaceId: input.workspaceId,
    userId: input.userId,
    type: "agent",
    sourceResourceType: "agent",
    sourceResourceId: input.agentId,
    version: input.version,
    changelog: input.changelog ?? "Initial marketplace publish",
    name,
    description: input.description ?? agent.description,
    visibility: input.visibility ?? "public",
    tags: input.tags,
    manifest,
    metadata: { agentId: input.agentId },
    status: "published",
    publishedAt: new Date(),
  });
}
