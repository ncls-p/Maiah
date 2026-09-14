import { sql, eq } from "drizzle-orm";
import { db } from "@/server/infrastructure/db";
import { conversations, usageEvents } from "@/server/infrastructure/db/schema";
export const usageBillingWorkspace = sql<string>`coalesce(${usageEvents.billingWorkspaceId}, ${usageEvents.workspaceId})`;
export async function resolveUsageBillingWorkspace(
  workspaceId: string,
  conversationId?: string,
) {
  if (!conversationId) return workspaceId;
  const [conversation] = await db
    .select({ billingWorkspaceId: conversations.billingWorkspaceId })
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);
  return conversation?.billingWorkspaceId ?? workspaceId;
}
