import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { logHandledError } from "@/lib/logger";
import { audit } from "@/server/domain/services/audit";
import { authorization } from "@/server/domain/services/authorization";
import { listDirectlyBoundResourceIds } from "@/server/infrastructure/db/access-resource-repository";
import { db } from "@/server/infrastructure/db";
import {
  agents,
  agentSkills,
  customTools,
  marketplaceInstalls,
  marketplaceItems,
  marketplaceItemVersions,
  marketplaceItemShares,
  mcpServers,
  mcpTools,
  users,
} from "@/server/infrastructure/db/schema";
import { upsertMarketplaceDraft } from "./draft-helpers";
import {
  installAgentManifest,
  installCustomTool,
  installMcpPreset,
  installPostInstallFlags,
} from "./install-helpers";
import {
  buildAgentManifest,
  buildCustomToolManifest,
  buildMcpPresetManifest,
  buildSkillManifest,
} from "./manifest-builders";
import { sanitizeMarketplaceManifest } from "./manifest-sanitizer";
import { MarketplaceVisibility } from "./use-cases.marketplace-visibility";
import { DraftInputExtras } from "./use-cases.get-marketplace-item-detail";

export async function createMarketplaceDraft(
  input: {
    workspaceId: string;
    userId: string;
    agentId: string;
    version: string;
    name?: string;
    description?: string;
    visibility?: MarketplaceVisibility;
  } & DraftInputExtras,
) {
  const [agent] = await db
    .select()
    .from(agents)
    .where(
      and(
        eq(agents.id, input.agentId),
        eq(agents.workspaceId, input.workspaceId),
      ),
    )
    .limit(1);
  if (!agent || agent.createdById !== input.userId) {
    throw new Error("Agent not found");
  }

  const name = input.name || agent.name;
  const manifest = await buildAgentManifest(
    input.agentId,
    input.workspaceId,
    name,
    input.description ?? agent.description,
  );

  return upsertMarketplaceDraft({
    workspaceId: input.workspaceId,
    userId: input.userId,
    type: "agent",
    sourceResourceType: "agent",
    sourceResourceId: input.agentId,
    version: input.version,
    changelog: input.changelog,
    name,
    description: input.description ?? agent.description,
    visibility: input.visibility,
    tags: input.tags,
    manifest,
    metadata: { agentId: input.agentId },
  });
}

export async function createSkillMarketplaceDraft(
  input: {
    workspaceId: string;
    userId: string;
    skillId: string;
    version: string;
    name?: string;
    description?: string;
    visibility?: MarketplaceVisibility;
  } & DraftInputExtras,
) {
  const [skill] = await db
    .select()
    .from(agentSkills)
    .where(
      and(
        eq(agentSkills.id, input.skillId),
        eq(agentSkills.workspaceId, input.workspaceId),
      ),
    )
    .limit(1);
  if (!skill || skill.createdById !== input.userId) {
    throw new Error("Skill not found");
  }

  const name = input.name || skill.name;
  const manifest = buildSkillManifest(
    skill,
    name,
    input.description ?? skill.description,
  );

  return upsertMarketplaceDraft({
    workspaceId: input.workspaceId,
    userId: input.userId,
    type: "skill",
    sourceResourceType: "skill",
    sourceResourceId: input.skillId,
    version: input.version,
    changelog: input.changelog,
    name,
    description: input.description ?? skill.description,
    visibility: input.visibility,
    tags: input.tags,
    manifest,
    metadata: { skillId: input.skillId },
  });
}

export async function createCustomToolMarketplaceDraft(
  input: {
    workspaceId: string;
    userId: string;
    customToolId: string;
    version: string;
    name?: string;
    description?: string;
    visibility?: MarketplaceVisibility;
  } & DraftInputExtras,
) {
  const [tool] = await db
    .select()
    .from(customTools)
    .where(
      and(
        eq(customTools.id, input.customToolId),
        eq(customTools.workspaceId, input.workspaceId),
      ),
    )
    .limit(1);
  if (!tool || tool.createdById !== input.userId) {
    throw new Error("Custom tool not found");
  }

  const name = input.name || tool.name;
  const manifest = await buildCustomToolManifest(
    tool,
    name,
    input.description ?? tool.description,
  );

  return upsertMarketplaceDraft({
    workspaceId: input.workspaceId,
    userId: input.userId,
    type: "custom_tool",
    sourceResourceType: "custom_tool",
    sourceResourceId: input.customToolId,
    version: input.version,
    changelog: input.changelog,
    name,
    description: input.description ?? tool.description,
    visibility: input.visibility,
    tags: input.tags,
    manifest,
    metadata: { customToolId: input.customToolId },
  });
}
