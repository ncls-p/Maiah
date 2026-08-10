import { audit } from "@/server/domain/services/audit";
import { db } from "@/server/infrastructure/db";
import { marketplaceItems } from "@/server/infrastructure/db/schema";
import { eq } from "drizzle-orm";

// ─── Admin moderation ──────────────────────────────────────────────────

export async function adminModerateItem(input: {
  itemId: string;
  adminUserId: string;
  action: "suspend" | "unsuspend" | "archive" | "unarchive";
}) {
  const [item] = await db
    .select()
    .from(marketplaceItems)
    .where(eq(marketplaceItems.id, input.itemId))
    .limit(1);
  if (!item) throw new Error("Marketplace item not found");

  let newStatus: string;
  switch (input.action) {
    case "suspend":
      newStatus = "suspended";
      break;
    case "unsuspend":
      newStatus = "published";
      break;
    case "archive":
      newStatus = "archived";
      break;
    case "unarchive":
      newStatus = "published";
      break;
    default:
      throw new Error(`Unknown moderation action: ${input.action}`);
  }

  const [updated] = await db
    .update(marketplaceItems)
    .set({ status: newStatus as never, updatedAt: new Date() })
    .where(eq(marketplaceItems.id, input.itemId))
    .returning();

  await audit.emit({
    workspaceId: item.publisherWorkspaceId ?? undefined,
    actorPrincipalType: "user",
    actorPrincipalId: input.adminUserId,
    action: `marketplace.${input.action}`,
    resourceType: "marketplace_item",
    resourceId: input.itemId,
    outcome: "success",
  });

  return updated;
}
