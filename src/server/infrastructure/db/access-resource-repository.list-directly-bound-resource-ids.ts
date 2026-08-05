import { and,eq,inArray,or } from "drizzle-orm";

import type { AccessResourceType } from "@/server/domain/entities/access-resource";
import { db } from "@/server/infrastructure/db";
import { roleBindings,teamMembers } from "@/server/infrastructure/db/schema";

export async function listDirectlyBoundResourceIds(userId: string, type: AccessResourceType) {
  const teamRows = await db.select({ teamId: teamMembers.teamId }).from(teamMembers).where(eq(teamMembers.userId, userId));
  const teamIds = teamRows.map(({ teamId }) => teamId);
  const principalCondition = teamIds.length ? or(and(eq(roleBindings.principalType, "user"), eq(roleBindings.principalId, userId)), and(eq(roleBindings.principalType, "group"), inArray(roleBindings.principalId, teamIds))) : and(eq(roleBindings.principalType, "user"), eq(roleBindings.principalId, userId));

  return db
    .selectDistinct({ resourceId: roleBindings.resourceId })
    .from(roleBindings)
    .where(and(eq(roleBindings.resourceType, type), principalCondition))
    .then((rows) => rows.map(({ resourceId }) => resourceId));
}
