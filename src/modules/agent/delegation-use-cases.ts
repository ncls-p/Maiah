import { and, eq, inArray, isNull, or } from "drizzle-orm";
import type { OrchestrationPolicy } from "@/modules/agent/orchestration-policy";
import type { db } from "@/server/infrastructure/db";
import {
  agentDelegationBindings,
  agents,
  agentVersions,
} from "@/server/infrastructure/db/schema";
import type { DelegationBindingInput } from "./orchestration-policy";

type BindingDb = Pick<typeof db, "select" | "insert">;

export class DelegationBindingValidationError extends Error {
  readonly code = "INVALID_DELEGATION_BINDING";

  constructor(message: string) {
    super(message);
    this.name = "DelegationBindingValidationError";
  }
}

export async function getDelegationBindingsForVersion(
  agentVersionId: string,
  executor: BindingDb,
) {
  return executor
    .select({
      id: agentDelegationBindings.id,
      childAgentId: agentDelegationBindings.childAgentId,
      childAgentVersionId: agentDelegationBindings.childAgentVersionId,
      instructions: agentDelegationBindings.instructions,
    })
    .from(agentDelegationBindings)
    .where(eq(agentDelegationBindings.agentVersionId, agentVersionId));
}

export async function findDelegationCycle(input: {
  parentAgentId: string;
  bindings: DelegationBindingInput[];
  loadBindings: (agentVersionId: string) => Promise<DelegationBindingInput[]>;
  maxVisitedVersions?: number;
}) {
  const pending = input.bindings.map((binding) => ({
    agentId: binding.childAgentId,
    versionId: binding.childAgentVersionId,
    path: [input.parentAgentId, binding.childAgentId],
  }));
  const visitedVersions = new Set<string>();
  const maxVisitedVersions = input.maxVisitedVersions ?? 5_000;

  while (pending.length > 0) {
    const current = pending.shift();
    if (!current) break;
    if (current.agentId === input.parentAgentId) return current.path;
    if (visitedVersions.has(current.versionId)) continue;
    visitedVersions.add(current.versionId);
    if (visitedVersions.size > maxVisitedVersions) {
      throw new DelegationBindingValidationError(
        "Delegation graph is too large to validate safely",
      );
    }

    const children = await input.loadBindings(current.versionId);
    for (const child of children) {
      pending.push({
        agentId: child.childAgentId,
        versionId: child.childAgentVersionId,
        path: [...current.path, child.childAgentId],
      });
    }
  }

  return null;
}

export async function validateDelegationBindings(input: {
  parentAgentId: string;
  workspaceId: string;
  userId: string;
  bindings: DelegationBindingInput[];
  policy: OrchestrationPolicy;
  executor: BindingDb;
}) {
  const uniqueChildIds = [
    ...new Set(input.bindings.map((b) => b.childAgentId)),
  ];
  if (uniqueChildIds.length !== input.bindings.length) {
    throw new DelegationBindingValidationError(
      "Each delegated agent can only be added once",
    );
  }
  if (input.bindings.length > input.policy.maxDelegations) {
    throw new DelegationBindingValidationError(
      `Delegation policy allows at most ${input.policy.maxDelegations} agents`,
    );
  }
  if (
    input.bindings.some(
      (binding) => binding.childAgentId === input.parentAgentId,
    )
  ) {
    throw new DelegationBindingValidationError(
      "An orchestrator cannot delegate to itself",
    );
  }
  if (input.bindings.length === 0) return [];

  const visibleAgents = await input.executor
    .select({ id: agents.id })
    .from(agents)
    .where(
      and(
        eq(agents.workspaceId, input.workspaceId),
        isNull(agents.archivedAt),
        inArray(agents.id, uniqueChildIds),
        or(
          eq(agents.createdById, input.userId),
          eq(agents.isGlobal, true),
          eq(agents.sharingMode, "marketplace"),
          and(
            eq(agents.sharingMode, "specific_user"),
            eq(agents.shareTargetUserId, input.userId),
          ),
        ),
      ),
    );
  const visibleIds = new Set(visibleAgents.map((agent) => agent.id));
  if (uniqueChildIds.some((agentId) => !visibleIds.has(agentId))) {
    throw new DelegationBindingValidationError("Delegated agent not found");
  }

  const versionIds = input.bindings.map(
    (binding) => binding.childAgentVersionId,
  );
  const versions = await input.executor
    .select({ id: agentVersions.id, agentId: agentVersions.agentId })
    .from(agentVersions)
    .where(inArray(agentVersions.id, versionIds));
  const versionOwnerById = new Map(
    versions.map((version) => [version.id, version.agentId]),
  );
  const mismatchedVersion = input.bindings.find(
    (binding) =>
      versionOwnerById.get(binding.childAgentVersionId) !==
      binding.childAgentId,
  );
  if (mismatchedVersion) {
    throw new DelegationBindingValidationError(
      "Delegated agent version does not belong to the selected agent",
    );
  }

  const cycle = await findDelegationCycle({
    parentAgentId: input.parentAgentId,
    bindings: input.bindings,
    loadBindings: (agentVersionId) =>
      getDelegationBindingsForVersion(agentVersionId, input.executor),
  });
  if (cycle) {
    throw new DelegationBindingValidationError(
      `Delegation cycle detected: ${cycle.join(" -> ")}`,
    );
  }

  return input.bindings;
}

export async function insertDelegationBindingsForVersion(input: {
  parentAgentId: string;
  agentVersionId: string;
  workspaceId: string;
  userId: string;
  bindings: DelegationBindingInput[];
  policy: OrchestrationPolicy;
  executor: BindingDb;
}) {
  const bindings = await validateDelegationBindings(input);
  if (bindings.length === 0) return;
  await input.executor.insert(agentDelegationBindings).values(
    bindings.map((binding) => ({
      agentVersionId: input.agentVersionId,
      childAgentId: binding.childAgentId,
      childAgentVersionId: binding.childAgentVersionId,
      instructions: binding.instructions?.trim() || null,
    })),
  );
}

export async function cloneDelegationBindings(input: {
  fromAgentVersionId: string | null;
  toAgentVersionId: string;
  parentAgentId: string;
  workspaceId: string;
  userId: string;
  policy: OrchestrationPolicy;
  executor: BindingDb;
}) {
  if (!input.fromAgentVersionId) return;
  const existing = await getDelegationBindingsForVersion(
    input.fromAgentVersionId,
    input.executor,
  );
  await insertDelegationBindingsForVersion({
    ...input,
    agentVersionId: input.toAgentVersionId,
    bindings: existing,
  });
}
