import { eq } from "drizzle-orm";

import {
  listBuiltInToolSummaries,
  type BuiltInToolSummary,
} from "@/modules/tool/builtin-tools-catalog";
import { db } from "@/server/infrastructure/db";
import {
  organizationBuiltinToolPolicies,
  workspaces,
} from "@/server/infrastructure/db/schema";

export type OrganizationBuiltInToolPolicy = BuiltInToolSummary & {
  enabled: boolean;
  requireApproval: boolean;
  configured: boolean;
};

export type EffectiveBuiltInToolPolicy = Pick<
  OrganizationBuiltInToolPolicy,
  "enabled" | "requireApproval"
>;

export function builtInToolRequiresApprovalByDefault(
  riskLevel: BuiltInToolSummary["riskLevel"],
) {
  return riskLevel === "high" || riskLevel === "critical";
}

export function resolveOrganizationBuiltInToolPolicies(
  configuredRows: Array<{
    toolName: string;
    enabled: boolean;
    requireApproval: boolean;
  }>,
): OrganizationBuiltInToolPolicy[] {
  const configuredByName = new Map(
    configuredRows.map((row) => [row.toolName, row]),
  );

  return listBuiltInToolSummaries().map((tool) => {
    const configured = configuredByName.get(tool.name);
    return {
      ...tool,
      enabled: configured?.enabled ?? true,
      requireApproval:
        configured?.requireApproval ??
        builtInToolRequiresApprovalByDefault(tool.riskLevel),
      configured: Boolean(configured),
    };
  });
}

async function organizationIdForWorkspace(workspaceId: string) {
  const [workspace] = await db
    .select({ organizationId: workspaces.organizationId })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  return workspace?.organizationId ?? null;
}

export async function listOrganizationBuiltInToolPolicies(
  workspaceId: string,
): Promise<OrganizationBuiltInToolPolicy[]> {
  const organizationId = await organizationIdForWorkspace(workspaceId);
  if (!organizationId) return [];

  const rows = await db
    .select({
      toolName: organizationBuiltinToolPolicies.toolName,
      enabled: organizationBuiltinToolPolicies.enabled,
      requireApproval: organizationBuiltinToolPolicies.requireApproval,
    })
    .from(organizationBuiltinToolPolicies)
    .where(eq(organizationBuiltinToolPolicies.organizationId, organizationId));

  return resolveOrganizationBuiltInToolPolicies(rows);
}

export async function getOrganizationBuiltInToolPolicyMap(
  workspaceId: string,
): Promise<Map<string, EffectiveBuiltInToolPolicy>> {
  const policies = await listOrganizationBuiltInToolPolicies(workspaceId);
  return new Map(
    policies.map((policy) => [
      policy.name,
      {
        enabled: policy.enabled,
        requireApproval: policy.requireApproval,
      },
    ]),
  );
}

export async function updateOrganizationBuiltInToolPolicy(input: {
  workspaceId: string;
  toolName: string;
  enabled?: boolean;
  requireApproval?: boolean;
  updatedById: string;
}): Promise<OrganizationBuiltInToolPolicy | null> {
  const organizationId = await organizationIdForWorkspace(input.workspaceId);
  if (!organizationId) return null;

  const tool = listBuiltInToolSummaries().find(
    (candidate) => candidate.name === input.toolName,
  );
  if (!tool) return null;

  const currentPolicies = await listOrganizationBuiltInToolPolicies(
    input.workspaceId,
  );
  const current = currentPolicies.find(
    (policy) => policy.name === input.toolName,
  );
  if (!current) return null;

  const enabled = input.enabled ?? current.enabled;
  const requireApproval = input.requireApproval ?? current.requireApproval;

  await db
    .insert(organizationBuiltinToolPolicies)
    .values({
      organizationId,
      toolName: input.toolName,
      enabled,
      requireApproval,
      updatedById: input.updatedById,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [
        organizationBuiltinToolPolicies.organizationId,
        organizationBuiltinToolPolicies.toolName,
      ],
      set: {
        enabled,
        requireApproval,
        updatedById: input.updatedById,
        updatedAt: new Date(),
      },
    });

  return {
    ...tool,
    enabled,
    requireApproval,
    configured: true,
  };
}
