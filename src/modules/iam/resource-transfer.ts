import { createHash } from "node:crypto";

import { and, eq, inArray, isNull } from "drizzle-orm";

import { audit } from "@/server/domain/services/audit";
import { authorization } from "@/server/domain/services/authorization";
import type { AccessResourceType } from "@/server/domain/entities/access-resource";
import { db } from "@/server/infrastructure/db";
import { findAccessResource } from "@/server/infrastructure/db/access-resource-repository";
import {
  agentDelegationBindings,
  agentKnowledgeBindings,
  agentRuns,
  agentSkillBindings,
  agentSkills,
  agentToolBindings,
  agents,
  agentVersions,
  aiModels,
  aiProviders,
  conversations,
  customToolCredentialRefs,
  customToolSecretRequests,
  customTools,
  documents,
  knowledgeBases,
  marketplaceItems,
  mcpServers,
  mcpTools,
  organizationMembers,
  organizations,
  roleBindings,
  roles,
  scheduledTasks,
  teamMembers,
  teams,
  toolConnectionRequirements,
  toolConnections,
  toolConnectors,
  toolInvocations,
  userAgentPreferences,
  userToolSettings,
  workflowAgentInputRequests,
  workflowAgentMessages,
  workflowAgentRunRequests,
  workflowAgentTodoLists,
  workflowRuns,
  workflows,
  workspaces,
} from "@/server/infrastructure/db/schema";
import { getWorkspacesByUserId } from "@/modules/workspace/use-cases";

import { IamOperationError } from "./use-cases";

export const TRANSFER_ACCESS_POLICIES = ["compatible", "remove_all"] as const;
export const TRANSFER_OWNERSHIP_POLICIES = ["preserve", "actor"] as const;
export const TRANSFER_SECRET_POLICIES = ["keep", "disable"] as const;

export type TransferAccessPolicy = (typeof TRANSFER_ACCESS_POLICIES)[number];
export type TransferOwnershipPolicy =
  (typeof TRANSFER_OWNERSHIP_POLICIES)[number];
export type TransferSecretPolicy = (typeof TRANSFER_SECRET_POLICIES)[number];

export type ResourceTransferOptions = {
  includeDependencies: boolean;
  accessPolicy: TransferAccessPolicy;
  ownershipPolicy: TransferOwnershipPolicy;
  secretPolicy: TransferSecretPolicy;
};

export type ResourceTransferItem = {
  type: AccessResourceType;
  id: string;
  name: string;
  reason: "selected" | "parent" | "dependency" | "dependent" | "history";
};

export type ResourceTransferPreview = {
  source: {
    workspaceId: string;
    workspaceName: string;
    organizationId: string;
    organizationName: string;
  };
  destination: {
    workspaceId: string;
    workspaceName: string;
    organizationId: string;
    organizationName: string;
  };
  crossOrganization: boolean;
  items: ResourceTransferItem[];
  warnings: string[];
  blockers: string[];
  directAssignments: { kept: number; removed: number };
  secrets: { affected: number; policy: TransferSecretPolicy };
  confirmationToken: string;
};

type TransferSeed = {
  type: AccessResourceType;
  id: string;
  reason: ResourceTransferItem["reason"];
};

type TransferSets = Record<
  AccessResourceType,
  Map<string, TransferSeed["reason"]>
>;

const RESOURCE_TYPES: AccessResourceType[] = [
  "agent",
  "provider",
  "model",
  "mcp_server",
  "tool_connector",
  "tool_connection",
  "custom_tool",
  "knowledge_base",
  "skill",
  "workflow",
  "scheduled_task",
  "conversation",
  "marketplace_item",
];

function emptyTransferSets(): TransferSets {
  return Object.fromEntries(
    RESOURCE_TYPES.map((type) => [type, new Map()]),
  ) as TransferSets;
}

function addResource(
  sets: TransferSets,
  type: AccessResourceType,
  id: string | null | undefined,
  reason: TransferSeed["reason"],
) {
  if (!id || sets[type].has(id)) return false;
  sets[type].set(id, reason);
  return true;
}

function ids(sets: TransferSets, type: AccessResourceType) {
  return [...sets[type].keys()];
}

async function requireTransferPermission(userId: string, workspaceId: string) {
  const result = await authorization.checkPermission(
    { principalType: "user", principalId: userId },
    "roles.manage",
    "workspace",
    workspaceId,
  );
  if (!result.granted) {
    throw new IamOperationError(
      "You need project access administration rights to transfer resources",
      403,
    );
  }
}

export async function listResourceTransferDestinations(input: {
  userId: string;
  sourceWorkspaceId: string;
}) {
  await requireTransferPermission(input.userId, input.sourceWorkspaceId);
  const candidates = await getWorkspacesByUserId(input.userId);
  const manageable = await Promise.all(
    candidates.map(async ({ workspace, organization }) => ({
      workspace,
      organization,
      allowed:
        workspace.id !== input.sourceWorkspaceId &&
        (
          await authorization.checkPermission(
            { principalType: "user", principalId: input.userId },
            "roles.manage",
            "workspace",
            workspace.id,
          )
        ).granted,
    })),
  );

  return manageable
    .filter(({ allowed }) => allowed)
    .map(({ workspace, organization }) => ({
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      organizationId: organization.id,
      organizationName: organization.name,
    }))
    .sort(
      (a, b) =>
        a.organizationName.localeCompare(b.organizationName) ||
        a.workspaceName.localeCompare(b.workspaceName),
    );
}

async function expandTransferGraph(
  sourceWorkspaceId: string,
  root: TransferSeed,
) {
  const sets = emptyTransferSets();
  addResource(sets, root.type, root.id, "selected");

  for (let iteration = 0; iteration < 20; iteration += 1) {
    let changed = false;
    const agentIds = ids(sets, "agent");
    if (agentIds.length > 0) {
      const versions = await db
        .select({
          id: agentVersions.id,
          providerId: agentVersions.providerId,
          modelId: agentVersions.modelId,
        })
        .from(agentVersions)
        .where(inArray(agentVersions.agentId, agentIds));
      const versionIds = versions.map(({ id }) => id);
      for (const version of versions) {
        changed =
          addResource(sets, "provider", version.providerId, "dependency") ||
          changed;
        changed =
          addResource(sets, "model", version.modelId, "dependency") || changed;
      }
      if (versionIds.length > 0) {
        const [knowledge, skills, delegations, tools] = await Promise.all([
          db
            .select({ id: agentKnowledgeBindings.knowledgeBaseId })
            .from(agentKnowledgeBindings)
            .where(inArray(agentKnowledgeBindings.agentVersionId, versionIds)),
          db
            .select({ id: agentSkillBindings.skillId })
            .from(agentSkillBindings)
            .where(inArray(agentSkillBindings.agentVersionId, versionIds)),
          db
            .select({ id: agentDelegationBindings.childAgentId })
            .from(agentDelegationBindings)
            .where(inArray(agentDelegationBindings.agentVersionId, versionIds)),
          db
            .select({
              source: agentToolBindings.toolSource,
              id: agentToolBindings.toolId,
            })
            .from(agentToolBindings)
            .where(inArray(agentToolBindings.agentVersionId, versionIds)),
        ]);
        for (const row of knowledge)
          changed =
            addResource(sets, "knowledge_base", row.id, "dependency") ||
            changed;
        for (const row of skills)
          changed = addResource(sets, "skill", row.id, "dependency") || changed;
        for (const row of delegations)
          changed = addResource(sets, "agent", row.id, "dependency") || changed;
        for (const tool of tools) {
          if (tool.source === "custom") {
            changed =
              addResource(sets, "custom_tool", tool.id, "dependency") ||
              changed;
          } else if (tool.source === "mcp") {
            const [mcpTool] = await db
              .select({ serverId: mcpTools.mcpServerId })
              .from(mcpTools)
              .where(eq(mcpTools.id, tool.id))
              .limit(1);
            changed =
              addResource(
                sets,
                "mcp_server",
                mcpTool?.serverId,
                "dependency",
              ) || changed;
          }
        }
      }

      const [history, tasks] = await Promise.all([
        db
          .select({ id: conversations.id })
          .from(conversations)
          .where(
            and(
              eq(conversations.workspaceId, sourceWorkspaceId),
              inArray(conversations.agentId, agentIds),
            ),
          ),
        db
          .select({ id: scheduledTasks.id })
          .from(scheduledTasks)
          .where(
            and(
              eq(scheduledTasks.workspaceId, sourceWorkspaceId),
              inArray(scheduledTasks.agentId, agentIds),
            ),
          ),
      ]);
      for (const row of history)
        changed =
          addResource(sets, "conversation", row.id, "history") || changed;
      for (const row of tasks)
        changed =
          addResource(sets, "scheduled_task", row.id, "dependent") || changed;
    }

    const providerIds = ids(sets, "provider");
    if (providerIds.length > 0) {
      const models = await db
        .select({ id: aiModels.id })
        .from(aiModels)
        .where(inArray(aiModels.providerId, providerIds));
      for (const model of models)
        changed = addResource(sets, "model", model.id, "parent") || changed;
    }

    const modelIds = ids(sets, "model");
    if (modelIds.length > 0) {
      const [modelRows, consumers] = await Promise.all([
        db
          .select({ providerId: aiModels.providerId })
          .from(aiModels)
          .where(inArray(aiModels.id, modelIds)),
        db
          .select({ agentId: agentVersions.agentId })
          .from(agentVersions)
          .where(inArray(agentVersions.modelId, modelIds)),
      ]);
      for (const model of modelRows)
        changed =
          addResource(sets, "provider", model.providerId, "parent") || changed;
      for (const consumer of consumers)
        changed =
          addResource(sets, "agent", consumer.agentId, "dependent") || changed;
    }

    if (providerIds.length > 0) {
      const consumers = await db
        .select({ agentId: agentVersions.agentId })
        .from(agentVersions)
        .where(inArray(agentVersions.providerId, providerIds));
      for (const consumer of consumers)
        changed =
          addResource(sets, "agent", consumer.agentId, "dependent") || changed;
    }

    const mcpServerIds = ids(sets, "mcp_server");
    if (mcpServerIds.length > 0) {
      const [tools, connectors] = await Promise.all([
        db
          .select({ id: mcpTools.id })
          .from(mcpTools)
          .where(inArray(mcpTools.mcpServerId, mcpServerIds)),
        db
          .select({ id: toolConnectors.id })
          .from(toolConnectors)
          .where(inArray(toolConnectors.mcpServerId, mcpServerIds)),
      ]);
      const toolIds = tools.map(({ id }) => id);
      if (toolIds.length > 0) {
        const bindings = await db
          .select({ versionId: agentToolBindings.agentVersionId })
          .from(agentToolBindings)
          .where(
            and(
              eq(agentToolBindings.toolSource, "mcp"),
              inArray(agentToolBindings.toolId, toolIds),
            ),
          );
        const versionIds = bindings.map(({ versionId }) => versionId);
        if (versionIds.length > 0) {
          const consumers = await db
            .select({ id: agentVersions.agentId })
            .from(agentVersions)
            .where(inArray(agentVersions.id, versionIds));
          for (const consumer of consumers)
            changed =
              addResource(sets, "agent", consumer.id, "dependent") || changed;
        }
      }
      for (const connector of connectors)
        changed =
          addResource(sets, "tool_connector", connector.id, "dependent") ||
          changed;
    }

    const connectorIds = ids(sets, "tool_connector");
    if (connectorIds.length > 0) {
      const [connectorRows, connections] = await Promise.all([
        db
          .select({ mcpServerId: toolConnectors.mcpServerId })
          .from(toolConnectors)
          .where(inArray(toolConnectors.id, connectorIds)),
        db
          .select({ id: toolConnections.id })
          .from(toolConnections)
          .where(inArray(toolConnections.connectorId, connectorIds)),
      ]);
      for (const connector of connectorRows)
        changed =
          addResource(
            sets,
            "mcp_server",
            connector.mcpServerId,
            "dependency",
          ) || changed;
      for (const connection of connections)
        changed =
          addResource(sets, "tool_connection", connection.id, "dependent") ||
          changed;
    }

    const connectionIds = ids(sets, "tool_connection");
    if (connectionIds.length > 0) {
      const rows = await db
        .select({ connectorId: toolConnections.connectorId })
        .from(toolConnections)
        .where(inArray(toolConnections.id, connectionIds));
      for (const row of rows)
        changed =
          addResource(sets, "tool_connector", row.connectorId, "parent") ||
          changed;
    }

    const customToolIds = ids(sets, "custom_tool");
    if (customToolIds.length > 0) {
      const bindings = await db
        .select({ versionId: agentToolBindings.agentVersionId })
        .from(agentToolBindings)
        .where(
          and(
            eq(agentToolBindings.toolSource, "custom"),
            inArray(agentToolBindings.toolId, customToolIds),
          ),
        );
      const versionIds = bindings.map(({ versionId }) => versionId);
      if (versionIds.length > 0) {
        const consumers = await db
          .select({ id: agentVersions.agentId })
          .from(agentVersions)
          .where(inArray(agentVersions.id, versionIds));
        for (const consumer of consumers)
          changed =
            addResource(sets, "agent", consumer.id, "dependent") || changed;
      }
    }

    const knowledgeIds = ids(sets, "knowledge_base");
    if (knowledgeIds.length > 0) {
      const bindings = await db
        .select({ versionId: agentKnowledgeBindings.agentVersionId })
        .from(agentKnowledgeBindings)
        .where(inArray(agentKnowledgeBindings.knowledgeBaseId, knowledgeIds));
      const versionIds = bindings.map(({ versionId }) => versionId);
      if (versionIds.length > 0) {
        const consumers = await db
          .select({ id: agentVersions.agentId })
          .from(agentVersions)
          .where(inArray(agentVersions.id, versionIds));
        for (const consumer of consumers)
          changed =
            addResource(sets, "agent", consumer.id, "dependent") || changed;
      }
    }

    const skillIds = ids(sets, "skill");
    if (skillIds.length > 0) {
      const bindings = await db
        .select({ versionId: agentSkillBindings.agentVersionId })
        .from(agentSkillBindings)
        .where(inArray(agentSkillBindings.skillId, skillIds));
      const versionIds = bindings.map(({ versionId }) => versionId);
      if (versionIds.length > 0) {
        const consumers = await db
          .select({ id: agentVersions.agentId })
          .from(agentVersions)
          .where(inArray(agentVersions.id, versionIds));
        for (const consumer of consumers)
          changed =
            addResource(sets, "agent", consumer.id, "dependent") || changed;
      }
    }

    const conversationIds = ids(sets, "conversation");
    if (conversationIds.length > 0) {
      const [rows, tasks] = await Promise.all([
        db
          .select({ agentId: conversations.agentId })
          .from(conversations)
          .where(inArray(conversations.id, conversationIds)),
        db
          .select({ id: scheduledTasks.id })
          .from(scheduledTasks)
          .where(inArray(scheduledTasks.conversationId, conversationIds)),
      ]);
      for (const row of rows)
        changed =
          addResource(sets, "agent", row.agentId, "dependency") || changed;
      for (const task of tasks)
        changed =
          addResource(sets, "scheduled_task", task.id, "dependent") || changed;
    }

    const taskIds = ids(sets, "scheduled_task");
    if (taskIds.length > 0) {
      const rows = await db
        .select({
          agentId: scheduledTasks.agentId,
          conversationId: scheduledTasks.conversationId,
        })
        .from(scheduledTasks)
        .where(inArray(scheduledTasks.id, taskIds));
      for (const row of rows) {
        changed =
          addResource(sets, "agent", row.agentId, "dependency") || changed;
        changed =
          addResource(sets, "conversation", row.conversationId, "dependency") ||
          changed;
      }
    }

    if (!changed) return sets;
  }

  throw new IamOperationError(
    "The resource dependency graph is too deep to transfer safely",
    409,
  );
}

async function hydrateItems(sets: TransferSets, sourceWorkspaceId: string) {
  const items: ResourceTransferItem[] = [];
  for (const type of RESOURCE_TYPES) {
    for (const [id, reason] of sets[type]) {
      const resource = await findAccessResource(type, id);
      if (resource?.workspaceId === sourceWorkspaceId) {
        items.push({ type, id, name: resource.name, reason });
      }
    }
  }
  return items.sort(
    (a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name),
  );
}

function transferFingerprint(input: {
  sourceWorkspaceId: string;
  targetWorkspaceId: string;
  options: ResourceTransferOptions;
  items: ResourceTransferItem[];
}) {
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

async function compatibleAssignmentCounts(
  items: ResourceTransferItem[],
  targetWorkspaceId: string,
  targetOrganizationId: string,
  policy: TransferAccessPolicy,
) {
  const bindings = (
    await Promise.all(
      RESOURCE_TYPES.map(async (type) => {
        const resourceIds = items
          .filter((item) => item.type === type)
          .map((item) => item.id);
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
          .where(
            and(
              eq(roleBindings.resourceType, type),
              inArray(roleBindings.resourceId, resourceIds),
            ),
          );
      }),
    )
  ).flat();
  if (policy === "remove_all") return { kept: 0, removed: bindings.length };

  const [memberRows, teamRows] = await Promise.all([
    db
      .select({ userId: organizationMembers.userId })
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, targetOrganizationId),
          eq(organizationMembers.status, "active"),
        ),
      ),
    db
      .select({ id: teams.id })
      .from(teams)
      .where(eq(teams.organizationId, targetOrganizationId)),
  ]);
  const memberIds = new Set(memberRows.map(({ userId }) => userId));
  const teamIds = new Set(teamRows.map(({ id }) => id));
  const kept = bindings.filter(
    (binding) =>
      ((binding.principalType === "user" &&
        memberIds.has(binding.principalId)) ||
        (binding.principalType === "group" &&
          teamIds.has(binding.principalId))) &&
      (binding.roleIsSystem ||
        (binding.roleOwnerType === "organization" &&
          binding.roleOwnerId === targetOrganizationId) ||
        (binding.roleOwnerType === "workspace" &&
          binding.roleOwnerId === targetWorkspaceId)),
  ).length;
  return { kept, removed: bindings.length - kept };
}

async function targetConflicts(sets: TransferSets, targetWorkspaceId: string) {
  const blockers: string[] = [];
  const agentIds = ids(sets, "agent");
  if (agentIds.length > 0) {
    const source = await db
      .select({ slug: agents.slug })
      .from(agents)
      .where(inArray(agents.id, agentIds));
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
      if (conflicts.length > 0)
        blockers.push(
          `Assistant URL conflict: ${conflicts.map(({ slug }) => slug).join(", ")}`,
        );
    }
  }
  const connectorIds = ids(sets, "tool_connector");
  if (connectorIds.length > 0) {
    const source = await db
      .select({ key: toolConnectors.key })
      .from(toolConnectors)
      .where(inArray(toolConnectors.id, connectorIds));
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
      if (conflicts.length > 0)
        blockers.push(
          `Connector key conflict: ${conflicts.map(({ key }) => key).join(", ")}`,
        );
    }
  }
  return blockers;
}

export async function previewResourceTransfer(input: {
  actorUserId: string;
  sourceWorkspaceId: string;
  targetWorkspaceId: string;
  resourceType: AccessResourceType;
  resourceId: string;
  options: ResourceTransferOptions;
}): Promise<ResourceTransferPreview> {
  if (input.sourceWorkspaceId === input.targetWorkspaceId) {
    throw new IamOperationError("Choose a different destination project", 400);
  }
  const resource = await findAccessResource(
    input.resourceType,
    input.resourceId,
  );
  if (!resource || resource.workspaceId !== input.sourceWorkspaceId) {
    throw new IamOperationError(
      "Resource not found in the source project",
      404,
    );
  }
  await Promise.all([
    requireTransferPermission(input.actorUserId, input.sourceWorkspaceId),
    requireTransferPermission(input.actorUserId, input.targetWorkspaceId),
  ]);
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
      .where(
        and(
          eq(workspaces.id, input.targetWorkspaceId),
          isNull(workspaces.archivedAt),
        ),
      )
      .limit(1)
      .then((rows) => rows[0]),
  ]);
  if (!sourceScope || !targetScope)
    throw new IamOperationError("Source or destination project not found", 404);

  const sets = await expandTransferGraph(input.sourceWorkspaceId, {
    type: input.resourceType,
    id: input.resourceId,
    reason: "selected",
  });
  const items = await hydrateItems(sets, input.sourceWorkspaceId);
  const crossOrganization =
    sourceScope.organizationId !== targetScope.organizationId;
  const blockers = await targetConflicts(sets, input.targetWorkspaceId);
  const relatedItems = items.filter((item) => item.reason !== "selected");
  if (!input.options.includeDependencies && relatedItems.length > 0) {
    blockers.push(
      `${relatedItems.length} linked resource(s) must be included to preserve data integrity`,
    );
  }
  const directAssignments = await compatibleAssignmentCounts(
    items,
    input.targetWorkspaceId,
    targetScope.organizationId,
    input.options.accessPolicy,
  );
  const secretTypes = new Set<AccessResourceType>([
    "provider",
    "mcp_server",
    "tool_connection",
  ]);
  const secretCount = items.filter((item) => secretTypes.has(item.type)).length;
  const warnings = [
    "Conversation and execution history linked to transferred assistants follows the transfer.",
  ];
  if (crossOrganization) {
    warnings.push(
      input.options.ownershipPolicy === "actor"
        ? "Resource ownership will be reassigned to you in the destination organization."
        : "Original creators are preserved even when they are not members of the destination organization.",
    );
    if (directAssignments.removed > 0) {
      warnings.push(
        `${directAssignments.removed} incompatible direct access assignment(s) will be removed.`,
      );
    }
  }
  if (input.options.secretPolicy === "disable" && secretCount > 0) {
    warnings.push(
      `${secretCount} connection(s) will be disabled and must be configured again in the destination.`,
    );
  }

  return {
    source: sourceScope,
    destination: targetScope,
    crossOrganization,
    items,
    warnings,
    blockers,
    directAssignments,
    secrets: { affected: secretCount, policy: input.options.secretPolicy },
    confirmationToken: transferFingerprint({
      sourceWorkspaceId: input.sourceWorkspaceId,
      targetWorkspaceId: input.targetWorkspaceId,
      options: input.options,
      items,
    }),
  };
}

async function findIncompatibleAssignmentIds(
  items: ResourceTransferItem[],
  targetWorkspaceId: string,
  targetOrganizationId: string,
  policy: TransferAccessPolicy,
) {
  const [members, targetTeams] = await Promise.all([
    db
      .select({ id: organizationMembers.userId })
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, targetOrganizationId),
          eq(organizationMembers.status, "active"),
        ),
      ),
    db
      .select({ id: teams.id })
      .from(teams)
      .where(eq(teams.organizationId, targetOrganizationId)),
  ]);
  const memberIds = new Set(members.map(({ id }) => id));
  const teamIds = new Set(targetTeams.map(({ id }) => id));
  const removeIds: string[] = [];

  for (const type of RESOURCE_TYPES) {
    const resourceIds = items
      .filter((item) => item.type === type)
      .map((item) => item.id);
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
      .where(
        and(
          eq(roleBindings.resourceType, type),
          inArray(roleBindings.resourceId, resourceIds),
        ),
      );
    removeIds.push(
      ...bindings
        .filter(
          (binding) =>
            policy === "remove_all" ||
            !(
              (binding.principalType === "user" &&
                memberIds.has(binding.principalId)) ||
              (binding.principalType === "group" &&
                teamIds.has(binding.principalId))
            ) ||
            !(
              binding.roleIsSystem ||
              (binding.roleOwnerType === "organization" &&
                binding.roleOwnerId === targetOrganizationId) ||
              (binding.roleOwnerType === "workspace" &&
                binding.roleOwnerId === targetWorkspaceId)
            ),
        )
        .map(({ id }) => id),
    );
  }
  return removeIds;
}

export async function executeResourceTransfer(input: {
  actorUserId: string;
  sourceWorkspaceId: string;
  targetWorkspaceId: string;
  resourceType: AccessResourceType;
  resourceId: string;
  options: ResourceTransferOptions;
  confirmationToken: string;
}) {
  const preview = await previewResourceTransfer(input);
  if (preview.blockers.length > 0) {
    throw new IamOperationError(preview.blockers.join(". "), 409);
  }
  if (preview.confirmationToken !== input.confirmationToken) {
    throw new IamOperationError(
      "The transfer preview changed. Review it again before confirming.",
      409,
    );
  }
  const byType = (type: AccessResourceType) =>
    preview.items.filter((item) => item.type === type).map((item) => item.id);
  const now = new Date();
  const targetWorkspaceId = input.targetWorkspaceId;
  const crossOrganization = preview.crossOrganization;
  const assignmentIdsToRemove = await findIncompatibleAssignmentIds(
    preview.items,
    targetWorkspaceId,
    preview.destination.organizationId,
    input.options.accessPolicy,
  );
  const organizationUserRows = await db
    .select({ userId: organizationMembers.userId })
    .from(organizationMembers)
    .where(
      inArray(organizationMembers.organizationId, [
        preview.source.organizationId,
        preview.destination.organizationId,
      ]),
    );
  const directPrincipalRows = (
    await Promise.all(
      RESOURCE_TYPES.map(async (type) => {
        const resourceIds = preview.items
          .filter((item) => item.type === type)
          .map((item) => item.id);
        if (resourceIds.length === 0) return [];
        return db
          .select({
            principalType: roleBindings.principalType,
            principalId: roleBindings.principalId,
          })
          .from(roleBindings)
          .where(
            and(
              eq(roleBindings.resourceType, type),
              inArray(roleBindings.resourceId, resourceIds),
            ),
          );
      }),
    )
  ).flat();
  const directTeamIds = directPrincipalRows
    .filter(({ principalType }) => principalType === "group")
    .map(({ principalId }) => principalId);
  const directTeamMemberRows =
    directTeamIds.length > 0
      ? await db
          .select({ userId: teamMembers.userId })
          .from(teamMembers)
          .where(inArray(teamMembers.teamId, directTeamIds))
      : [];
  const affectedUserIds = new Set([
    input.actorUserId,
    ...organizationUserRows.map(({ userId }) => userId),
    ...directPrincipalRows
      .filter(({ principalType }) => principalType === "user")
      .map(({ principalId }) => principalId),
    ...directTeamMemberRows.map(({ userId }) => userId),
  ]);

  await db.transaction(async (tx) => {
    if (assignmentIdsToRemove.length > 0) {
      await tx
        .delete(roleBindings)
        .where(inArray(roleBindings.id, assignmentIdsToRemove));
    }
    const agentIds = byType("agent");
    const providerIds = byType("provider");
    const mcpIds = byType("mcp_server");
    const connectorIds = byType("tool_connector");
    const connectionIds = byType("tool_connection");
    const customIds = byType("custom_tool");
    const knowledgeIds = byType("knowledge_base");
    const skillIds = byType("skill");
    const workflowIds = byType("workflow");
    const taskIds = byType("scheduled_task");
    const conversationIds = byType("conversation");
    const marketplaceIds = byType("marketplace_item");

    if (conversationIds.length > 0) {
      await tx
        .update(conversations)
        .set({
          workspaceId: targetWorkspaceId,
          folderId: null,
          updatedAt: now,
          ...(crossOrganization && input.options.ownershipPolicy === "actor"
            ? { userId: input.actorUserId }
            : {}),
        })
        .where(inArray(conversations.id, conversationIds));
      await tx
        .update(toolInvocations)
        .set({ workspaceId: targetWorkspaceId })
        .where(inArray(toolInvocations.conversationId, conversationIds));
    }
    if (agentIds.length > 0) {
      await tx
        .update(agents)
        .set({
          workspaceId: targetWorkspaceId,
          updatedAt: now,
          ...(crossOrganization && input.options.ownershipPolicy === "actor"
            ? { createdById: input.actorUserId }
            : {}),
        })
        .where(inArray(agents.id, agentIds));
      await tx
        .update(agentRuns)
        .set({ workspaceId: targetWorkspaceId, updatedAt: now })
        .where(inArray(agentRuns.agentId, agentIds));
      await tx
        .delete(userAgentPreferences)
        .where(inArray(userAgentPreferences.defaultAgentId, agentIds));
    }
    if (providerIds.length > 0) {
      await tx
        .update(aiProviders)
        .set({
          workspaceId: targetWorkspaceId,
          updatedAt: now,
          ...(crossOrganization && input.options.ownershipPolicy === "actor"
            ? { createdById: input.actorUserId }
            : {}),
          ...(input.options.secretPolicy === "disable"
            ? {
                enabled: false,
                encryptedApiKey: null,
                encryptedHeadersJson: null,
                healthStatus: null,
              }
            : {}),
        })
        .where(inArray(aiProviders.id, providerIds));
    }
    if (mcpIds.length > 0) {
      await tx
        .update(mcpServers)
        .set({
          workspaceId: targetWorkspaceId,
          updatedAt: now,
          ...(crossOrganization && input.options.ownershipPolicy === "actor"
            ? { createdById: input.actorUserId }
            : {}),
          ...(input.options.secretPolicy === "disable"
            ? {
                enabled: false,
                encryptedHeadersJson: null,
                encryptedEnvJson: null,
                healthStatus: null,
              }
            : {}),
        })
        .where(inArray(mcpServers.id, mcpIds));
    }
    if (connectorIds.length > 0) {
      await tx
        .update(toolConnectors)
        .set({
          workspaceId: targetWorkspaceId,
          updatedAt: now,
          ...(crossOrganization && input.options.ownershipPolicy === "actor"
            ? { createdById: input.actorUserId }
            : {}),
        })
        .where(inArray(toolConnectors.id, connectorIds));
      await tx
        .update(toolConnectionRequirements)
        .set({ workspaceId: targetWorkspaceId, updatedAt: now })
        .where(inArray(toolConnectionRequirements.connectorId, connectorIds));
    }
    if (connectionIds.length > 0) {
      await tx
        .update(toolConnections)
        .set({
          workspaceId: targetWorkspaceId,
          updatedAt: now,
          ...(crossOrganization && input.options.ownershipPolicy === "actor"
            ? { ownerType: "workspace", ownerUserId: null }
            : {}),
          ...(input.options.secretPolicy === "disable"
            ? {
                encryptedSecretsJson: null,
                status: "invalid" as const,
                lastValidatedAt: null,
              }
            : {}),
        })
        .where(inArray(toolConnections.id, connectionIds));
      await tx
        .update(userToolSettings)
        .set({ workspaceId: targetWorkspaceId, updatedAt: now })
        .where(inArray(userToolSettings.connectionId, connectionIds));
    }
    if (customIds.length > 0) {
      await tx
        .update(customTools)
        .set({
          workspaceId: targetWorkspaceId,
          updatedAt: now,
          ...(crossOrganization && input.options.ownershipPolicy === "actor"
            ? { createdById: input.actorUserId }
            : {}),
        })
        .where(inArray(customTools.id, customIds));
      const secretRequests = await tx
        .select({ credentialId: customToolSecretRequests.credentialRefId })
        .from(customToolSecretRequests)
        .where(inArray(customToolSecretRequests.customToolId, customIds));
      await tx
        .update(customToolSecretRequests)
        .set({
          workspaceId: targetWorkspaceId,
          ...(crossOrganization && input.options.ownershipPolicy === "actor"
            ? { userId: input.actorUserId }
            : {}),
        })
        .where(inArray(customToolSecretRequests.customToolId, customIds));
      const credentialIds = secretRequests
        .map(({ credentialId }) => credentialId)
        .filter((id): id is string => Boolean(id));
      if (credentialIds.length > 0) {
        await tx
          .update(customToolCredentialRefs)
          .set({
            workspaceId: targetWorkspaceId,
            ...(crossOrganization && input.options.ownershipPolicy === "actor"
              ? { userId: input.actorUserId }
              : {}),
          })
          .where(inArray(customToolCredentialRefs.id, credentialIds));
      }
    }
    if (knowledgeIds.length > 0) {
      await tx
        .update(knowledgeBases)
        .set({
          workspaceId: targetWorkspaceId,
          updatedAt: now,
          ...(crossOrganization && input.options.ownershipPolicy === "actor"
            ? { createdById: input.actorUserId }
            : {}),
        })
        .where(inArray(knowledgeBases.id, knowledgeIds));
      await tx
        .update(documents)
        .set({
          workspaceId: targetWorkspaceId,
          updatedAt: now,
          ...(crossOrganization && input.options.ownershipPolicy === "actor"
            ? { createdById: input.actorUserId }
            : {}),
        })
        .where(inArray(documents.knowledgeBaseId, knowledgeIds));
    }
    if (skillIds.length > 0) {
      await tx
        .update(agentSkills)
        .set({
          workspaceId: targetWorkspaceId,
          updatedAt: now,
          ...(crossOrganization && input.options.ownershipPolicy === "actor"
            ? { createdById: input.actorUserId }
            : {}),
        })
        .where(inArray(agentSkills.id, skillIds));
    }
    if (workflowIds.length > 0) {
      await tx
        .update(workflows)
        .set({
          workspaceId: targetWorkspaceId,
          updatedAt: now,
          ...(crossOrganization && input.options.ownershipPolicy === "actor"
            ? { createdById: input.actorUserId }
            : {}),
        })
        .where(inArray(workflows.id, workflowIds));
      await tx
        .update(workflowRuns)
        .set({ workspaceId: targetWorkspaceId })
        .where(inArray(workflowRuns.workflowId, workflowIds));
      for (const table of [
        workflowAgentMessages,
        workflowAgentInputRequests,
        workflowAgentRunRequests,
        workflowAgentTodoLists,
      ]) {
        await tx
          .update(table)
          .set({ workspaceId: targetWorkspaceId })
          .where(inArray(table.workflowId, workflowIds));
      }
    }
    if (taskIds.length > 0) {
      await tx
        .update(scheduledTasks)
        .set({
          workspaceId: targetWorkspaceId,
          updatedAt: now,
          ...(crossOrganization && input.options.ownershipPolicy === "actor"
            ? { userId: input.actorUserId }
            : {}),
        })
        .where(inArray(scheduledTasks.id, taskIds));
    }
    if (marketplaceIds.length > 0) {
      await tx
        .update(marketplaceItems)
        .set({ publisherWorkspaceId: targetWorkspaceId, updatedAt: now })
        .where(inArray(marketplaceItems.id, marketplaceIds));
    }
  });

  await Promise.all(
    [...affectedUserIds].map((userId) =>
      authorization.invalidatePrincipalPermissionCache(userId),
    ),
  );
  await audit.emit({
    organizationId: preview.destination.organizationId,
    workspaceId: input.targetWorkspaceId,
    actorPrincipalType: "user",
    actorPrincipalId: input.actorUserId,
    action: "resource.transferred",
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    outcome: "success",
    metadata: {
      sourceWorkspaceId: input.sourceWorkspaceId,
      targetWorkspaceId: input.targetWorkspaceId,
      crossOrganization,
      itemCount: preview.items.length,
      options: input.options,
    },
  });

  return {
    transferred: preview.items.length,
    destination: preview.destination,
  };
}
