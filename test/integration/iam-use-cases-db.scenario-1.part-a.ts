import { eq } from "drizzle-orm";

import {
  addOrganizationMember,
  addTeamMember,
  createCustomRole,
  createOrganizationWithProject,
  createProject,
  createTeam,
} from "@/modules/iam/use-cases";
import { db } from "@/server/infrastructure/db";
import { workspaces } from "@/server/infrastructure/db/schema";
import type { IamDatabaseScenarioContext } from "./iam-use-cases-db.context";

export interface IamScenario1State {
  organizationId: string;
  firstProjectId: string;
  secondProjectId: string;
  sharedAgentId: string;
  teamId: string;
  projectRoleId: string;
  resourceRoleId: string;
  privateAgentId: string;
  memberOwnedAgentId: string;
  providerId: string;
  modelId: string;
  modelRoleId: string;
}

export async function runIamDatabaseScenario1PartA(
  context: IamDatabaseScenarioContext,
  state: IamScenario1State,
) {
  const { suffix, ownerId, memberEmail } = context;
  const firstProject = await createOrganizationWithProject({
    userId: ownerId,
    organizationName: `IAM Organization ${suffix}`,
    organizationSlug: `iam-org-${suffix}`,
    projectName: "Operations",
    projectSlug: "operations",
  });
  state.firstProjectId = firstProject.id;

  const [scope] = await db
    .select({ organizationId: workspaces.organizationId })
    .from(workspaces)
    .where(eq(workspaces.id, state.firstProjectId))
    .limit(1);
  state.organizationId = scope.organizationId;
  context.organizationIds.push(state.organizationId);

  const secondProject = await createProject({
    userId: ownerId,
    workspaceId: state.firstProjectId,
    name: "Customer Hub",
    slug: "customer-hub",
  });
  state.secondProjectId = secondProject.id;

  await addOrganizationMember({
    actorUserId: ownerId,
    workspaceId: state.firstProjectId,
    email: memberEmail,
  });

  const team = await createTeam({
    actorUserId: ownerId,
    workspaceId: state.firstProjectId,
    name: "Support Leads",
    description: "Shared support access",
  });
  state.teamId = team.id;
  await addTeamMember({
    actorUserId: ownerId,
    workspaceId: state.firstProjectId,
    teamId: team.id,
    userId: context.memberId,
  });

  const projectRole = await createCustomRole({
    actorUserId: ownerId,
    workspaceId: state.secondProjectId,
    displayName: "Support Reader",
    description: "Read assistants and workflows",
    scopeType: "workspace",
    permissions: ["agents.get", "workflows.view"],
  });
  state.projectRoleId = projectRole.id;
  const resourceRole = await createCustomRole({
    actorUserId: ownerId,
    workspaceId: state.secondProjectId,
    displayName: "Assistant Reader",
    description: "Read one selected assistant",
    scopeType: "workspace",
    permissions: ["agents.get"],
  });
  state.resourceRoleId = resourceRole.id;
}
