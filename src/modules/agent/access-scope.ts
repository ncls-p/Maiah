import { authorization } from "@/server/domain/services/authorization";
import { db } from "@/server/infrastructure/db";
import {
  agents,
  organizations,
  roleBindings,
  roles,
  teamMembers,
  teams,
  workspaces,
} from "@/server/infrastructure/db/schema";
import { and, asc, eq, inArray } from "drizzle-orm";
import {
  AgentAccessError,
  loadAgentGraphIds,
  loadOwnedAgentGraph,
  type AccessExecutor,
} from "./access-scope.agent-graph";

export { AgentAccessError } from "./access-scope.agent-graph";

export const AGENT_ACCESS_SCOPES = [
  "private",
  "project",
  "organization",
  "team",
] as const;
export type AgentAccessScope = (typeof AGENT_ACCESS_SCOPES)[number];

export type AgentAccessSelection = {
  scope: AgentAccessScope;
  teamId?: string | null;
};

export type AgentAccessOptions = {
  scopes: AgentAccessScope[];
  teams: Array<{ id: string; name: string }>;
  projectName: string;
  organizationName: string;
};

async function workspaceScope(workspaceId: string) {
  const [scope] = await db
    .select({
      workspaceId: workspaces.id,
      projectName: workspaces.name,
      organizationId: organizations.id,
      organizationName: organizations.name,
    })
    .from(workspaces)
    .innerJoin(organizations, eq(workspaces.organizationId, organizations.id))
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  if (!scope) throw new AgentAccessError("Project not found", 404);
  return scope;
}

export async function getAgentAccessOptions(
  userId: string,
  workspaceId: string,
): Promise<AgentAccessOptions> {
  const scope = await workspaceScope(workspaceId);
  const [canShareProject, canShareOrganization] = await Promise.all([
    authorization.hasPermission(
      { principalType: "user", principalId: userId },
      "roles.manage",
      "workspace",
      workspaceId,
    ),
    authorization.hasPermission(
      { principalType: "user", principalId: userId },
      "roles.manage",
      "organization",
      scope.organizationId,
    ),
  ]);
  const availableScopes: AgentAccessScope[] = ["private"];
  if (canShareProject) availableScopes.push("project", "team");
  if (canShareOrganization) availableScopes.push("organization");
  const teamRows = canShareProject
    ? await db
        .select({ id: teams.id, name: teams.name })
        .from(teams)
        .where(eq(teams.organizationId, scope.organizationId))
        .orderBy(asc(teams.name))
    : [];
  return {
    scopes: availableScopes,
    teams: teamRows,
    projectName: scope.projectName,
    organizationName: scope.organizationName,
  };
}

export async function validateAgentAccessSelection(input: {
  userId: string;
  workspaceId: string;
  selection: AgentAccessSelection;
}) {
  const options = await getAgentAccessOptions(input.userId, input.workspaceId);
  if (!options.scopes.includes(input.selection.scope)) {
    throw new AgentAccessError(
      "You do not have permission to share assistants at this scope",
    );
  }
  if (input.selection.scope !== "team") return;
  if (!input.selection.teamId)
    throw new AgentAccessError("A team is required", 400);
  if (!options.teams.some(({ id }) => id === input.selection.teamId)) {
    throw new AgentAccessError(
      "The selected team is outside this organization",
      400,
    );
  }
}

export async function applyAgentAccessSelection(
  input: {
    agentId: string;
    userId: string;
    selection: AgentAccessSelection;
  },
  executor: AccessExecutor = db,
) {
  const agentIds = await loadOwnedAgentGraph(
    input.agentId,
    input.userId,
    executor,
  );
  const affectedUserIds: string[] = [];
  for (const agentId of agentIds) {
    affectedUserIds.push(
      ...(await applySingleAgentAccessSelection(
        { ...input, agentId },
        executor,
      )),
    );
  }
  return [...new Set(affectedUserIds)];
}

async function applySingleAgentAccessSelection(
  input: {
    agentId: string;
    userId: string;
    selection: AgentAccessSelection;
  },
  executor: AccessExecutor,
) {
  const [useRole] = await executor
    .select({ id: roles.id })
    .from(roles)
    .where(
      and(
        eq(roles.name, "workspace.agent_user"),
        eq(roles.scopeType, "workspace"),
        eq(roles.isSystem, true),
      ),
    )
    .limit(1);
  if (!useRole)
    throw new AgentAccessError("Assistant access role is unavailable", 500);

  const previousTeams = await executor
    .select({ teamId: roleBindings.principalId })
    .from(roleBindings)
    .where(
      and(
        eq(roleBindings.resourceType, "agent"),
        eq(roleBindings.resourceId, input.agentId),
        eq(roleBindings.roleId, useRole.id),
        eq(roleBindings.principalType, "group"),
      ),
    );
  const affectedTeamIds = [
    ...new Set([
      ...previousTeams.map(({ teamId }) => teamId),
      ...(input.selection.scope === "team" && input.selection.teamId
        ? [input.selection.teamId]
        : []),
    ]),
  ];
  const affectedUsers =
    affectedTeamIds.length > 0
      ? await executor
          .select({ userId: teamMembers.userId })
          .from(teamMembers)
          .where(inArray(teamMembers.teamId, affectedTeamIds))
      : [];

  await executor
    .delete(roleBindings)
    .where(
      and(
        eq(roleBindings.resourceType, "agent"),
        eq(roleBindings.resourceId, input.agentId),
        eq(roleBindings.roleId, useRole.id),
      ),
    );

  const visibility =
    input.selection.scope === "project"
      ? "workspace"
      : input.selection.scope === "organization"
        ? "organization"
        : "private";
  await executor
    .update(agents)
    .set({
      visibility,
      isGlobal:
        input.selection.scope === "project" ||
        input.selection.scope === "organization",
      sharingMode: "personal",
      shareTargetUserId: null,
      updatedAt: new Date(),
    })
    .where(eq(agents.id, input.agentId));

  if (input.selection.scope === "team" && input.selection.teamId) {
    await executor.insert(roleBindings).values({
      principalType: "group",
      principalId: input.selection.teamId,
      roleId: useRole.id,
      resourceType: "agent",
      resourceId: input.agentId,
      createdById: input.userId,
    });
  }

  return [...new Set(affectedUsers.map(({ userId }) => userId))];
}

export async function invalidateAgentAccessCache(
  agentId: string,
  userIds: string[],
) {
  const agentIds = await loadAgentGraphIds(agentId, db);
  await Promise.all(
    agentIds.flatMap((resourceId) =>
      userIds.map((userId) =>
        authorization.invalidatePermissionCache(userId, "agent", resourceId),
      ),
    ),
  );
}

export async function getAgentAccessSelection(
  agent: typeof agents.$inferSelect,
): Promise<AgentAccessSelection> {
  const [binding] = await db
    .select({ teamId: roleBindings.principalId })
    .from(roleBindings)
    .innerJoin(roles, eq(roleBindings.roleId, roles.id))
    .where(
      and(
        eq(roleBindings.resourceType, "agent"),
        eq(roleBindings.resourceId, agent.id),
        eq(roleBindings.principalType, "group"),
        eq(roles.name, "workspace.agent_user"),
        eq(roles.scopeType, "workspace"),
        eq(roles.isSystem, true),
      ),
    )
    .limit(1);
  if (binding) return { scope: "team", teamId: binding.teamId };
  if (agent.visibility === "organization") return { scope: "organization" };
  if (agent.visibility === "workspace" || agent.isGlobal)
    return { scope: "project" };
  return { scope: "private" };
}
