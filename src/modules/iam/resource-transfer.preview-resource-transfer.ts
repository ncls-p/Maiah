import { and,eq,isNull } from "drizzle-orm";

import { type AccessResourceType } from "@/server/domain/entities/access-resource";
import { db } from "@/server/infrastructure/db";
import { findAccessResource } from "@/server/infrastructure/db/access-resource-repository";
import { organizations,roles,workspaceMembers,workspaces } from "@/server/infrastructure/db/schema";

import { expandTransferGraph } from "./resource-transfer.expand-transfer-graph";
import { compatibleAssignmentCounts,hydrateItems,targetConflicts,transferFingerprint } from "./resource-transfer.hydrate-items";
import { ResourceTransferOptions,ResourceTransferPreview,ResourceTransferRootType,requireTransferPermission } from "./resource-transfer.transfer-access-policies";
import { IamOperationError } from "./use-cases";

export async function previewResourceTransfer(input: { actorUserId: string; sourceWorkspaceId: string; targetWorkspaceId: string; resourceType: ResourceTransferRootType; resourceId: string; options: ResourceTransferOptions }): Promise<ResourceTransferPreview> {
  if (input.sourceWorkspaceId === input.targetWorkspaceId) {
    throw new IamOperationError("Choose a different destination project", 400);
  }
  if (input.resourceType !== "workspace") {
    const resource = await findAccessResource(input.resourceType, input.resourceId);
    if (!resource || resource.workspaceId !== input.sourceWorkspaceId) {
      throw new IamOperationError("Resource not found in the source project", 404);
    }
  } else if (input.resourceId !== input.sourceWorkspaceId) {
    throw new IamOperationError("Invalid source project", 400);
  }
  await Promise.all([requireTransferPermission(input.actorUserId, input.sourceWorkspaceId), requireTransferPermission(input.actorUserId, input.targetWorkspaceId)]);
  const [sourceScope, targetScope] = await Promise.all([
    db
      .select({
        workspaceId: workspaces.id,
        workspaceName: workspaces.name,
        organizationId: organizations.id,
        organizationName: organizations.name,
      })
      .from(workspaces)
      .innerJoin(organizations, eq(workspaces.organizationId, organizations.id))
      .where(eq(workspaces.id, input.sourceWorkspaceId))
      .limit(1)
      .then((rows) => rows[0]),
    db
      .select({
        workspaceId: workspaces.id,
        workspaceName: workspaces.name,
        organizationId: organizations.id,
        organizationName: organizations.name,
      })
      .from(workspaces)
      .innerJoin(organizations, eq(workspaces.organizationId, organizations.id))
      .where(and(eq(workspaces.id, input.targetWorkspaceId), isNull(workspaces.archivedAt)))
      .limit(1)
      .then((rows) => rows[0]),
  ]);
  if (!sourceScope || !targetScope) throw new IamOperationError("Source or destination project not found", 404);

  const sets = await expandTransferGraph(input.sourceWorkspaceId, {
    type: input.resourceType,
    id: input.resourceId,
    reason: "selected",
  });
  const items = await hydrateItems(sets, input.sourceWorkspaceId);
  const crossOrganization = sourceScope.organizationId !== targetScope.organizationId;
  const blockers = await targetConflicts(sets, input.targetWorkspaceId);
  if (input.resourceType === "workspace") {
    const [sourceRoles, targetRoles] = await Promise.all([
      db
        .select({ name: roles.name })
        .from(roles)
        .where(and(eq(roles.isSystem, false), eq(roles.ownerResourceType, "workspace"), eq(roles.ownerResourceId, input.sourceWorkspaceId))),
      db
        .select({ name: roles.name })
        .from(roles)
        .where(and(eq(roles.isSystem, false), eq(roles.ownerResourceType, "workspace"), eq(roles.ownerResourceId, input.targetWorkspaceId))),
    ]);
    const targetRoleNames = new Set(targetRoles.map(({ name }) => name));
    const conflicts = sourceRoles.map(({ name }) => name).filter((name) => targetRoleNames.has(name));
    if (conflicts.length > 0) {
      blockers.push(`Project role conflict: ${conflicts.join(", ")}`);
    }
  }
  const relatedItems = items.filter((item) => item.reason !== "selected");
  if (!input.options.includeDependencies && relatedItems.length > 0) {
    blockers.push(`${relatedItems.length} linked resource(s) must be included to preserve data integrity`);
  }
  const directAssignments = await compatibleAssignmentCounts(items, input.targetWorkspaceId, targetScope.organizationId, input.options.accessPolicy);
  const secretTypes = new Set<AccessResourceType>(["provider", "mcp_server", "tool_connection"]);
  const secretCount = items.filter((item) => secretTypes.has(item.type)).length;
  const memberRows =
    input.resourceType === "workspace"
      ? await db
          .select({ userId: workspaceMembers.userId })
          .from(workspaceMembers)
          .where(and(eq(workspaceMembers.workspaceId, input.sourceWorkspaceId), eq(workspaceMembers.status, "active")))
      : [];
  const warnings = ["Conversation and execution history linked to transferred assistants follows the transfer."];
  if (crossOrganization) {
    warnings.push(input.options.ownershipPolicy === "actor" ? "Resource ownership will be reassigned to you in the destination organization." : "Original creators are preserved even when they are not members of the destination organization.");
    if (directAssignments.removed > 0) {
      warnings.push(`${directAssignments.removed} incompatible direct access assignment(s) will be removed.`);
    }
  }
  if (input.options.secretPolicy === "disable" && secretCount > 0) {
    warnings.push(`${secretCount} connection(s) will be disabled and must be configured again in the destination.`);
  }

  return {
    source: sourceScope,
    destination: targetScope,
    crossOrganization,
    items,
    warnings,
    blockers,
    directAssignments,
    members: { moved: memberRows.length },
    secrets: { affected: secretCount, policy: input.options.secretPolicy },
    confirmationToken: transferFingerprint({
      sourceWorkspaceId: input.sourceWorkspaceId,
      targetWorkspaceId: input.targetWorkspaceId,
      options: input.options,
      items,
    }),
  };
}
