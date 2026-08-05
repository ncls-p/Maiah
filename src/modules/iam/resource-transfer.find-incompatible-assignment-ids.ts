import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/server/infrastructure/db";
import { organizationMembers, roleBindings, roles, teams } from "@/server/infrastructure/db/schema";

import { RESOURCE_TYPES, ResourceTransferItem, TransferAccessPolicy } from "./resource-transfer.transfer-access-policies";

export async function findIncompatibleAssignmentIds(items: ResourceTransferItem[], targetWorkspaceId: string, targetOrganizationId: string, policy: TransferAccessPolicy) {
  const [members, targetTeams] = await Promise.all([
    db
      .select({ id: organizationMembers.userId })
      .from(organizationMembers)
      .where(and(eq(organizationMembers.organizationId, targetOrganizationId), eq(organizationMembers.status, "active"))),
    db.select({ id: teams.id }).from(teams).where(eq(teams.organizationId, targetOrganizationId)),
  ]);
  const memberIds = new Set(members.map(({ id }) => id));
  const teamIds = new Set(targetTeams.map(({ id }) => id));
  const removeIds: string[] = [];

  for (const type of RESOURCE_TYPES) {
    const resourceIds = items.filter((item) => item.type === type).map((item) => item.id);
    if (resourceIds.length === 0) continue;
    const bindings = await db
      .select({
        id: roleBindings.id,
        principalType: roleBindings.principalType,
        principalId: roleBindings.principalId,
        roleIsSystem: roles.isSystem,
        roleOwnerType: roles.ownerResourceType,
        roleOwnerId: roles.ownerResourceId,
      })
      .from(roleBindings)
      .innerJoin(roles, eq(roleBindings.roleId, roles.id))
      .where(and(eq(roleBindings.resourceType, type), inArray(roleBindings.resourceId, resourceIds)));
    removeIds.push(...bindings.filter((binding) => policy === "remove_all" || !((binding.principalType === "user" && memberIds.has(binding.principalId)) || (binding.principalType === "group" && teamIds.has(binding.principalId))) || !(binding.roleIsSystem || (binding.roleOwnerType === "organization" && binding.roleOwnerId === targetOrganizationId) || (binding.roleOwnerType === "workspace" && binding.roleOwnerId === targetWorkspaceId))).map(({ id }) => id));
  }
  return removeIds;
}
