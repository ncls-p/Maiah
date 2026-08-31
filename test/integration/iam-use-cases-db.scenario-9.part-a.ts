import { expect } from "vitest";

import { getAgentAccessOptions, validateAgentAccessSelection } from "@/modules/agent/access-scope";
import {
  addOrganizationMember,
  addTeamMember,
  createTeam,
} from "@/modules/iam/use-cases";
import { addWorkspaceMember } from "@/modules/workspace/use-cases";
import { db } from "@/server/infrastructure/db";
import { agents } from "@/server/infrastructure/db/schema";
import type { IamDatabaseScenarioContext } from "./iam-use-cases-db.context";

export interface IamScenario9State {
  teamId: string;
  agent: typeof agents.$inferSelect;
  specialist: typeof agents.$inferSelect;
  rootVersionId: string;
  specialistVersionId: string;
  knowledgeBaseId: string;
  chunkId: string;
}

export async function runIamDatabaseScenario9PartA(
  context: IamDatabaseScenarioContext,
  state: IamScenario9State,
) {
  const { ownerId, memberId, memberEmail, secondProjectId, suffix } = context;
  await addOrganizationMember({
    actorUserId: ownerId,
    workspaceId: secondProjectId,
    email: memberEmail,
  });
  await addWorkspaceMember({
    workspaceId: secondProjectId,
    userId: memberId,
    invitedBy: ownerId,
  });
  const team = await createTeam({
    actorUserId: ownerId,
    workspaceId: secondProjectId,
    name: "Assistant users",
  });
  state.teamId = team.id;
  await addTeamMember({
    actorUserId: ownerId,
    workspaceId: secondProjectId,
    teamId: team.id,
    userId: memberId,
  });

  const ownerOptions = await getAgentAccessOptions(ownerId, secondProjectId);
  expect(ownerOptions.scopes).toEqual(
    expect.arrayContaining(["private", "project", "organization", "team"]),
  );
  expect(ownerOptions.teams).toEqual(
    expect.arrayContaining([expect.objectContaining({ id: team.id })]),
  );

  await expect(
    validateAgentAccessSelection({
      userId: memberId,
      workspaceId: secondProjectId,
      selection: { scope: "organization" },
    }),
  ).rejects.toMatchObject({ status: 403 });

  const [agent, specialist] = await db
    .insert(agents)
    .values([
      {
        workspaceId: secondProjectId,
        name: "Team scoped orchestrator",
        slug: `team-scoped-${suffix}`,
        kind: "orchestrator" as const,
        createdById: ownerId,
      },
      {
        workspaceId: secondProjectId,
        name: "Team scoped specialist",
        slug: `team-specialist-${suffix}`,
        createdById: ownerId,
      },
    ])
    .returning();
  state.agent = agent;
  state.specialist = specialist;
}
