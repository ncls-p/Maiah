import { logger } from "@/lib/logger";
import { cloneDelegationBindings } from "@/modules/agent/delegation-use-cases";
import { normalizeOrchestrationPolicy } from "@/modules/agent/orchestration-policy";
import { cloneKnowledgeBindings } from "@/modules/knowledge/use-cases";
import { cloneSkillBindings } from "@/modules/skills/use-cases";
import { cloneToolBindings } from "@/modules/tool/use-cases";
import { audit } from "@/server/domain/services/audit";
import { db } from "@/server/infrastructure/db";
import { agents, agentVersions } from "@/server/infrastructure/db/schema";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { CloneAgentInput, UpdateAgentInput } from "./use-cases.agent-row";
import { createAvailableAgentSlug } from "./use-cases.create-available-agent-slug";
import { getVisibleAgentById } from "./use-cases.get-visible-agent-by-id";
import { updateAgentUnlocked } from "./use-cases.update-agent-unlocked";

export async function reorderOrganizationAgents(input: {
  workspaceId: string;
  userId: string;
  agentIds: string[];
}) {
  const agentIds = Array.from(new Set(input.agentIds));
  if (agentIds.length === 0) return;

  const rows = await db
    .select({ id: agents.id })
    .from(agents)
    .where(
      and(
        eq(agents.workspaceId, input.workspaceId),
        isNull(agents.archivedAt),
        inArray(agents.id, agentIds),
        or(eq(agents.isGlobal, true), eq(agents.isRecommended, true)),
      ),
    );
  if (rows.length !== agentIds.length) {
    throw new Error("Organization assistant not found");
  }

  await db.transaction(async (tx) => {
    for (const [index, agentId] of agentIds.entries()) {
      await tx
        .update(agents)
        .set({ organizationDisplayOrder: index, updatedAt: new Date() })
        .where(eq(agents.id, agentId));
    }
  });

  await audit.emit({
    workspaceId: input.workspaceId,
    actorPrincipalType: "user",
    actorPrincipalId: input.userId,
    action: "agent.organization_order.updated",
    resourceType: "workspace",
    resourceId: input.workspaceId,
    outcome: "success",
    metadata: { agentIds },
  });
}

export async function getActiveVersionConfig(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  activeVersionId: string | null,
) {
  if (!activeVersionId) return null;
  const [v] = await tx
    .select()
    .from(agentVersions)
    .where(eq(agentVersions.id, activeVersionId))
    .limit(1);
  return v || null;
}

export async function cloneAgent(input: CloneAgentInput) {
  const source = await getVisibleAgentById(
    input.agentId,
    input.workspaceId,
    input.userId,
    Boolean(input.canAdminCurate),
  );
  if (!source) throw new Error("Agent not found");

  const name = input.name?.trim() || `Copy of ${source.name}`;
  const slug = input.slug?.trim()
    ? await createAvailableAgentSlug(input.workspaceId, input.slug)
    : await createAvailableAgentSlug(input.workspaceId, name);

  const { agent, version } = await db.transaction(async (tx) => {
    const sourceVersion = await getActiveVersionConfig(
      tx,
      source.activeVersionId,
    );
    const sourceOrchestrationPolicy =
      source.kind === "orchestrator"
        ? normalizeOrchestrationPolicy(sourceVersion?.orchestrationPolicyJson)
        : null;
    const [agent] = await tx
      .insert(agents)
      .values({
        workspaceId: input.workspaceId,
        name,
        slug,
        description: source.description,
        logoUrl: source.logoUrl,
        createdById: input.userId,
        visibility: "private",
        sourceType: "fork",
        kind: source.kind,
        sharingMode: "personal",
        shareTargetUserId: null,
        isGlobal: false,
        isRecommended: false,
        curationLabel: null,
        promptSuggestionsJson: source.promptSuggestionsJson,
        forkedFromAgentId: source.id,
      })
      .returning();

    const [version] = await tx
      .insert(agentVersions)
      .values({
        agentId: agent.id,
        versionNumber: 1,
        name: "Initial version",
        systemPrompt: sourceVersion?.systemPrompt ?? null,
        providerId: sourceVersion?.providerId ?? null,
        modelId: sourceVersion?.modelId ?? null,
        temperature: sourceVersion?.temperature ?? null,
        topP: sourceVersion?.topP ?? null,
        maxOutputTokens: sourceVersion?.maxOutputTokens ?? 30_000,
        maxToolCalls: sourceVersion?.maxToolCalls ?? 20,
        toolChoice: sourceVersion?.toolChoice ?? null,
        generationSettingsJson: sourceVersion?.generationSettingsJson ?? null,
        responseFormatJson: sourceVersion?.responseFormatJson ?? null,
        memoryPolicyJson: sourceVersion?.memoryPolicyJson ?? null,
        guardrailsJson: sourceVersion?.guardrailsJson ?? null,
        approvalPolicyJson: sourceVersion?.approvalPolicyJson ?? null,
        orchestrationPolicyJson: sourceOrchestrationPolicy,
        createdById: input.userId,
      })
      .returning();

    await tx
      .update(agents)
      .set({ activeVersionId: version.id })
      .where(eq(agents.id, agent.id));

    await cloneToolBindings(
      source.activeVersionId,
      version.id,
      input.workspaceId,
      { userId: input.userId },
      tx,
    );
    await cloneKnowledgeBindings(
      source.activeVersionId,
      version.id,
      input.workspaceId,
      { userId: input.userId },
      tx,
    );
    await cloneSkillBindings(
      source.activeVersionId,
      version.id,
      input.workspaceId,
      { userId: input.userId },
      tx,
    );
    if (sourceOrchestrationPolicy) {
      await cloneDelegationBindings({
        fromAgentVersionId: source.activeVersionId,
        toAgentVersionId: version.id,
        parentAgentId: agent.id,
        workspaceId: input.workspaceId,
        userId: input.userId,
        policy: sourceOrchestrationPolicy,
        executor: tx,
      });
    }

    return { agent, version };
  });

  await audit.emit({
    workspaceId: input.workspaceId,
    actorPrincipalType: "user",
    actorPrincipalId: input.userId,
    action: "agent.cloned",
    resourceType: "agent",
    resourceId: agent.id,
    outcome: "success",
    metadata: { sourceAgentId: source.id },
  });

  logger.info("Agent cloned", {
    agentId: agent.id,
    sourceAgentId: source.id,
    userId: input.userId,
  });
  return { agent, version };
}

const agentUpdateLocks = new Map<string, Promise<void>>();

async function withAgentUpdateLock<T>(
  agentId: string,
  operation: () => Promise<T>,
) {
  const previous = agentUpdateLocks.get(agentId) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queued = previous.then(
    () => current,
    () => current,
  );
  agentUpdateLocks.set(agentId, queued);
  await previous.catch(() => undefined);
  try {
    return await operation();
  } finally {
    release();
    if (agentUpdateLocks.get(agentId) === queued) {
      agentUpdateLocks.delete(agentId);
    }
  }
}

export async function updateAgent(input: UpdateAgentInput) {
  return withAgentUpdateLock(input.agentId, () => updateAgentUnlocked(input));
}
