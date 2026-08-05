import { createHash } from "node:crypto";

import { and,eq,inArray } from "drizzle-orm";

import { db } from "@/server/infrastructure/db";
import { findAccessResource } from "@/server/infrastructure/db/access-resource-repository";
import { agents,organizationMembers,roleBindings,roles,teams,toolConnectors } from "@/server/infrastructure/db/schema";

import { RESOURCE_TYPES,ResourceTransferItem,ResourceTransferOptions,TransferAccessPolicy,TransferSets,ids } from "./resource-transfer.transfer-access-policies";

export async function hydrateItems(sets: TransferSets, sourceWorkspaceId: string) {
  const items: ResourceTransferItem[] = [];
  for (const type of RESOURCE_TYPES) {
    for (const [id, reason] of sets[type]) {
      const resource = await findAccessResource(type, id);
      if (resource?.workspaceId === sourceWorkspaceId) {
        items.push({ type, id, name: resource.name, reason });
      }
    }
  }
  return items.sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
}

export function transferFingerprint(input: { sourceWorkspaceId: string; targetWorkspaceId: string; options: ResourceTransferOptions; items: ResourceTransferItem[] }) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        sourceWorkspaceId: input.sourceWorkspaceId,
        targetWorkspaceId: input.targetWorkspaceId,
        options: input.options,
        items: input.items.map(({ type, id }) => `${type}:${id}`).sort(),
      }),
    )
    .digest("hex");
}

export async function compatibleAssignmentCounts(items: ResourceTransferItem[], targetWorkspaceId: string, targetOrganizationId: string, policy: TransferAccessPolicy) {
  const bindings = (
    await Promise.all(
      RESOURCE_TYPES.map(async (type) => {
        const resourceIds = items.filter((item) => item.type === type).map((item) => item.id);
        if (resourceIds.length === 0) return [];
        return db
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
      }),
    )
  ).flat();
  if (policy === "remove_all") return { kept: 0, removed: bindings.length };

  const [memberRows, teamRows] = await Promise.all([
    db
      .select({ userId: organizationMembers.userId })
      .from(organizationMembers)
      .where(and(eq(organizationMembers.organizationId, targetOrganizationId), eq(organizationMembers.status, "active"))),
    db.select({ id: teams.id }).from(teams).where(eq(teams.organizationId, targetOrganizationId)),
  ]);
  const memberIds = new Set(memberRows.map(({ userId }) => userId));
  const teamIds = new Set(teamRows.map(({ id }) => id));
  const kept = bindings.filter((binding) => ((binding.principalType === "user" && memberIds.has(binding.principalId)) || (binding.principalType === "group" && teamIds.has(binding.principalId))) && (binding.roleIsSystem || (binding.roleOwnerType === "organization" && binding.roleOwnerId === targetOrganizationId) || (binding.roleOwnerType === "workspace" && binding.roleOwnerId === targetWorkspaceId))).length;
  return { kept, removed: bindings.length - kept };
}

export async function targetConflicts(sets: TransferSets, targetWorkspaceId: string) {
  const blockers: string[] = [];
  const agentIds = ids(sets, "agent");
  if (agentIds.length > 0) {
    const source = await db.select({ slug: agents.slug }).from(agents).where(inArray(agents.id, agentIds));
    if (source.length > 0) {
      const conflicts = await db
        .select({ slug: agents.slug })
        .from(agents)
        .where(
          and(
            eq(agents.workspaceId, targetWorkspaceId),
            inArray(
              agents.slug,
              source.map(({ slug }) => slug),
            ),
          ),
        );
      if (conflicts.length > 0) blockers.push(`Assistant URL conflict: ${conflicts.map(({ slug }) => slug).join(", ")}`);
    }
  }
  const connectorIds = ids(sets, "tool_connector");
  if (connectorIds.length > 0) {
    const source = await db.select({ key: toolConnectors.key }).from(toolConnectors).where(inArray(toolConnectors.id, connectorIds));
    if (source.length > 0) {
      const conflicts = await db
        .select({ key: toolConnectors.key })
        .from(toolConnectors)
        .where(
          and(
            eq(toolConnectors.workspaceId, targetWorkspaceId),
            inArray(
              toolConnectors.key,
              source.map(({ key }) => key),
            ),
          ),
        );
      if (conflicts.length > 0) blockers.push(`Connector key conflict: ${conflicts.map(({ key }) => key).join(", ")}`);
    }
  }
  return blockers;
}
