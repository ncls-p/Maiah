import { NextResponse } from "next/server";

import { requireWorkspacePermissionAsync } from "@/lib/route-handler";
import { getMarketplaceItem } from "@/modules/marketplace/use-cases";

export async function requireMarketplaceItemMutationPermission(
  userId: string,
  itemId: string,
) {
  const item = await getMarketplaceItem(itemId);
  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!item.publisherWorkspaceId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return requireWorkspacePermissionAsync(
    userId,
    item.publisherWorkspaceId,
    "marketplaceItems.publish",
  );
}
