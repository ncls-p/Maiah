import { eq } from "drizzle-orm";

import type { AccessResourceType } from "@/server/domain/entities/access-resource";
import { db } from "@/server/infrastructure/db";
import { workspaces } from "@/server/infrastructure/db/schema";

export type AccessResourceScope = {
  id: string;
  type: AccessResourceType;
  name: string;
  workspaceId: string;
  organizationId: string;
  parent?: { type: AccessResourceType; id: string };
};

export type ResourceRow = Omit<AccessResourceScope, "type" | "organizationId">;

export async function withOrganization(type: AccessResourceType, row: ResourceRow | undefined): Promise<AccessResourceScope | null> {
  if (!row) return null;
  const [workspace] = await db.select({ organizationId: workspaces.organizationId }).from(workspaces).where(eq(workspaces.id, row.workspaceId)).limit(1);
  if (!workspace) return null;
  return { ...row, type, organizationId: workspace.organizationId };
}
