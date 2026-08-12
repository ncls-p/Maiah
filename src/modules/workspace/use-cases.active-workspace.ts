import { db } from "@/server/infrastructure/db";
import { userWorkspacePreferences } from "@/server/infrastructure/db/schema";
import { eq } from "drizzle-orm";

export async function getActiveWorkspaceIdForUser(userId: string) {
  const [preference] = await db
    .select({ activeWorkspaceId: userWorkspacePreferences.activeWorkspaceId })
    .from(userWorkspacePreferences)
    .where(eq(userWorkspacePreferences.userId, userId))
    .limit(1);

  return preference?.activeWorkspaceId ?? null;
}

export async function setActiveWorkspaceForUser(
  userId: string,
  activeWorkspaceId: string,
) {
  await db
    .insert(userWorkspacePreferences)
    .values({ userId, activeWorkspaceId })
    .onConflictDoUpdate({
      target: userWorkspacePreferences.userId,
      set: { activeWorkspaceId, updatedAt: new Date() },
    });
}
