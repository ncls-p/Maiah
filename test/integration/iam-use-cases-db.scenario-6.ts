
import { eq } from "drizzle-orm";
import { expect } from "vitest";

import { executeOrganizationClone,executeOrganizationTransfer,previewOrganizationClone,previewOrganizationTransfer } from "@/modules/iam/organization-transfer";
import { createOrganizationWithProject,createProject } from "@/modules/iam/use-cases";
import { db } from "@/server/infrastructure/db";
import { workspaces } from "@/server/infrastructure/db/schema";
import type { IamDatabaseScenarioContext } from "./iam-use-cases-db.context";

export async function runIamDatabaseScenario6(context: IamDatabaseScenarioContext) {
  const { suffix, ownerId, organizationIds } = context;
  const { organizationId } = context;
    const sourceProject = await createOrganizationWithProject({
      userId: ownerId,
      organizationName: `Migration source ${suffix}`,
      organizationSlug: `migration-source-${suffix}`,
      projectName: "Source project",
      projectSlug: "source-project",
    });
    const targetProject = await createOrganizationWithProject({
      userId: ownerId,
      organizationName: `Migration target ${suffix}`,
      organizationSlug: `migration-target-${suffix}`,
      projectName: "Target project",
      projectSlug: "target-project",
    });
    const [sourceScope, targetScope] = await Promise.all([
      db
        .select({ organizationId: workspaces.organizationId })
        .from(workspaces)
        .where(eq(workspaces.id, sourceProject.id))
        .then((rows) => rows[0]),
      db
        .select({ organizationId: workspaces.organizationId })
        .from(workspaces)
        .where(eq(workspaces.id, targetProject.id))
        .then((rows) => rows[0]),
    ]);
    organizationIds.push(sourceScope.organizationId, targetScope.organizationId);
    const conflictingSourceProject = await createProject({
      userId: ownerId,
      workspaceId: sourceProject.id,
      name: "Conflicting source project",
      slug: "target-project",
    });

    const [sourceProjectsBeforeSimulation, targetProjectsBeforeSimulation] = await Promise.all([db.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.organizationId, sourceScope.organizationId)), db.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.organizationId, targetScope.organizationId))]);
    const clonePreview = await previewOrganizationClone({
      actorUserId: ownerId,
      sourceWorkspaceId: sourceProject.id,
      targetOrganizationId: targetScope.organizationId,
      secretPolicy: "disable",
    });
    const [sourceProjectsAfterSimulation, targetProjectsAfterSimulation] = await Promise.all([db.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.organizationId, sourceScope.organizationId)), db.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.organizationId, targetScope.organizationId))]);
    expect(sourceProjectsAfterSimulation).toEqual(sourceProjectsBeforeSimulation);
    expect(targetProjectsAfterSimulation).toEqual(targetProjectsBeforeSimulation);
    expect(clonePreview.counts.projects).toBe(2);
    expect(clonePreview.conflictResolutions).toEqual([]);
    await executeOrganizationClone({
      actorUserId: ownerId,
      sourceWorkspaceId: sourceProject.id,
      targetOrganizationId: targetScope.organizationId,
      secretPolicy: "disable",
      confirmationToken: clonePreview.confirmationToken,
    });
    const clonedProjects = await db.select({ name: workspaces.name }).from(workspaces).where(eq(workspaces.organizationId, targetScope.organizationId));
    expect(clonedProjects.map(({ name }) => name)).toContain("Source project (copy)");

    const movePreview = await previewOrganizationTransfer({
      actorUserId: ownerId,
      sourceWorkspaceId: sourceProject.id,
      targetOrganizationId: targetScope.organizationId,
    });
    expect(movePreview.blockers).toEqual([]);
    expect(movePreview.conflictResolutions).toContainEqual({
      resourceType: "project",
      resourceId: conflictingSourceProject.id,
      label: "Conflicting source project",
      from: "target-project",
      to: "target-project-2",
    });
    await executeOrganizationTransfer({
      actorUserId: ownerId,
      sourceWorkspaceId: sourceProject.id,
      targetOrganizationId: targetScope.organizationId,
      confirmationToken: movePreview.confirmationToken,
    });
    const remainingSourceProjects = await db.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.organizationId, sourceScope.organizationId));
    const [movedSourceProject, renamedConflictingProject] = await Promise.all([
      db
        .select({ organizationId: workspaces.organizationId })
        .from(workspaces)
        .where(eq(workspaces.id, sourceProject.id))
        .then((rows) => rows[0]),
      db
        .select({ slug: workspaces.slug })
        .from(workspaces)
        .where(eq(workspaces.id, conflictingSourceProject.id))
        .then((rows) => rows[0]),
    ]);
    expect(remainingSourceProjects).toHaveLength(0);
    expect(movedSourceProject.organizationId).toBe(targetScope.organizationId);
    expect(renamedConflictingProject.slug).toBe("target-project-2");
  
}
