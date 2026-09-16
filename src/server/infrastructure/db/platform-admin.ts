import { eq } from "drizzle-orm";
import { db } from "@/server/infrastructure/db";
import { users } from "@/server/infrastructure/db/schema";

/** Read current authority: never persist or cache implicit tenant memberships. */
export async function isPlatformAdminUser(userId: string): Promise<boolean> {
  const [user] = await db
    .select({ role: users.role, banned: users.banned })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return user?.role === "admin" && user.banned !== true;
}
