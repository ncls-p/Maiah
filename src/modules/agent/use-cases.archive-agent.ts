import { decryptValue } from "@/lib/crypto";
import { logger } from "@/lib/logger";
import { normalizeOpenAICompatibleApiRoute } from "@/lib/openai-compatible-api";
import { audit } from "@/server/domain/services/audit";
import { db } from "@/server/infrastructure/db";
import {
  agents,
  agentVersions,
  aiModels,
  aiProviders,
  conversations,
} from "@/server/infrastructure/db/schema";
import type {
  ProviderKind,
  ProviderRuntimeConfig,
} from "@/server/infrastructure/providers";
import { and, eq, isNull, sql } from "drizzle-orm";
import { AgentVersionRow } from "./use-cases.agent-row";
import { canEditAgentForScope } from "./use-cases.get-visible-agent-by-id";

export async function archiveAgent(
  agentId: string,
  workspaceId: string,
  userId: string,
  canAdminCurate = false,
) {
  const [existing] = await db
    .select()
    .from(agents)
    .where(and(eq(agents.id, agentId), eq(agents.workspaceId, workspaceId)))
    .limit(1);

  if (!existing) {
    throw new Error("Agent not found");
  }

  if (!(await canEditAgentForScope(existing, userId, canAdminCurate))) {
    throw new Error("Only the creator or an admin can delete this agent");
  }

  await db
    .update(agents)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(eq(agents.id, agentId));

  await audit.emit({
    workspaceId,
    actorPrincipalType: "user",
    actorPrincipalId: userId,
    action: "agent.archived",
    resourceType: "agent",
    resourceId: agentId,
    outcome: "success",
  });

  logger.info("Agent archived", { agentId, userId });
}

// ─── Agent Versions ────────────────────────────────────────────────────

export async function getAgentVersionById(
  versionId: string,
): Promise<AgentVersionRow | null> {
  const [version] = await db
    .select()
    .from(agentVersions)
    .where(eq(agentVersions.id, versionId))
    .limit(1);

  return version || null;
}

export async function getAgentVersions(agentId: string) {
  return db
    .select()
    .from(agentVersions)
    .where(eq(agentVersions.agentId, agentId))
    .orderBy(sql`${agentVersions.versionNumber} DESC`);
}

export async function getActiveVersion(
  agentId: string,
): Promise<AgentVersionRow | null> {
  const [agent] = await db
    .select({ activeVersionId: agents.activeVersionId })
    .from(agents)
    .where(eq(agents.id, agentId))
    .limit(1);

  if (!agent?.activeVersionId) return null;

  return getAgentVersionById(agent.activeVersionId);
}

// ─── Provider Resolution for Chat ──────────────────────────────────────

export interface ResolvedProviderConfig {
  runtimeConfig: ProviderRuntimeConfig;
  modelId: string;
  modelRecordId?: string;
  contextWindow?: number;
  providerKind: ProviderKind;
  providerId: string;
}

export async function resolveProviderForVersion(
  version: AgentVersionRow,
): Promise<ResolvedProviderConfig | null> {
  if (!version.providerId) return null;

  const [provider] = await db
    .select()
    .from(aiProviders)
    .where(
      and(
        eq(aiProviders.id, version.providerId),
        eq(aiProviders.enabled, true),
        isNull(aiProviders.archivedAt),
      ),
    )
    .limit(1);

  if (!provider) return null;

  // Decrypt secrets
  let apiKey: string | undefined;
  if (provider.encryptedApiKey) {
    apiKey = await decryptValue(provider.encryptedApiKey);
  }

  let headers: Record<string, string> | undefined;
  if (provider.encryptedHeadersJson) {
    headers = {};
    for (const [k, v] of Object.entries(
      provider.encryptedHeadersJson as Record<string, string>,
    )) {
      headers[k] = await decryptValue(v);
    }
  }

  let runtimeModelId = "";
  let modelRecordId: string | undefined;
  let contextWindow: number | undefined;
  if (version.modelId) {
    const [model] = await db
      .select()
      .from(aiModels)
      .where(
        and(
          eq(aiModels.id, version.modelId),
          eq(aiModels.providerId, provider.id),
          eq(aiModels.enabled, true),
        ),
      )
      .limit(1);

    if (model) {
      runtimeModelId = model.modelId;
      modelRecordId = model.id;
      contextWindow = model.contextWindow ?? undefined;
    }
  }

  return {
    runtimeConfig: {
      kind: provider.kind as ProviderKind,
      name: provider.name,
      baseUrl: provider.baseUrl || undefined,
      authType: provider.authType,
      apiKey,
      headers,
      queryParams: provider.queryParamsJson as
        | Record<string, string>
        | undefined,
      openaiCompatibleApiRoute: normalizeOpenAICompatibleApiRoute(
        provider.openaiCompatibleApiRoute,
      ),
    },
    modelId: runtimeModelId,
    modelRecordId,
    contextWindow,
    providerKind: provider.kind as ProviderKind,
    providerId: provider.id,
  };
}

// ─── Conversations ─────────────────────────────────────────────────────

export async function getConversationsByAgent(agentId: string, userId: string) {
  return db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.agentId, agentId),
        eq(conversations.userId, userId),
        eq(conversations.status, "active"),
        isNull(conversations.archivedAt),
      ),
    )
    .orderBy(sql`${conversations.updatedAt} DESC`);
}
