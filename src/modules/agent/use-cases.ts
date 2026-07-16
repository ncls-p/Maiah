import { and, eq, inArray, isNull, sql, max, or } from "drizzle-orm";
import { db } from "@/server/infrastructure/db";
import {
  agents,
  agentVersions,
  aiModels,
  aiProviders,
  conversations,
  messages,
  messageParts,
  usageEvents,
  users,
  userAgentPreferences,
} from "@/server/infrastructure/db/schema";
import { decryptValue } from "@/lib/crypto";
import { logHandledError } from "@/lib/logger";
import { normalizeOpenAICompatibleApiRoute } from "@/lib/openai-compatible-api";
import { projectToolMessagePayload } from "@/modules/tool/safe-payload";
import type {
  ProviderRuntimeConfig,
  ProviderKind,
} from "@/server/infrastructure/providers";
import { audit } from "@/server/domain/services/audit";
import { logger } from "@/lib/logger";
import {
  cloneKnowledgeBindings,
  replaceKnowledgeBindingsForVersion,
} from "@/modules/knowledge/use-cases";
import {
  cloneSkillBindings,
  replaceSkillBindingsForVersion,
} from "@/modules/skills/use-cases";
import type { AiHubToolApprovalPolicy } from "@/modules/tool/approval-policy";
import { BUILTIN_TOOL_SUMMARIES } from "@/modules/tool/builtin-tools-catalog";
import {
  cloneToolBindings,
  getToolBindingsForVersion,
  insertToolBindingsForVersion,
  type ToolBindingInput,
} from "@/modules/tool/use-cases";
import {
  cloneDelegationBindings,
  insertDelegationBindingsForVersion,
} from "@/modules/agent/delegation-use-cases";
import {
  normalizeOrchestrationPolicy,
  type DelegationBindingInput,
  type OrchestrationPolicy,
} from "@/modules/agent/orchestration-policy";
import {
  ONBOARDING_BUILTIN_TOOL_NAMES,
  ONBOARDING_TOOL_PRESET,
  type AgentToolPreset,
} from "@/modules/agent/onboarding-tools";

// ─── Types ─────────────────────────────────────────────────────────────

export type AgentRow = typeof agents.$inferSelect;
export type AgentVersionRow = typeof agentVersions.$inferSelect;
type AgentSharingMode = "personal" | "marketplace" | "specific_user";
type AgentKind = "assistant" | "orchestrator";
export type AgentCurationLabel =
  | "recommended"
  | "organization_created"
  | "none";

export interface CreateAgentInput {
  workspaceId: string;
  userId: string;
  name: string;
  slug: string;
  kind?: AgentKind;
  description?: string;
  logoUrl?: string | null;
  systemPrompt?: string;
  providerId?: string;
  modelId?: string;
  temperature?: string;
  topP?: string;
  maxOutputTokens?: number;
  maxToolCalls?: number;
  toolPreset?: AgentToolPreset;
  toolBindings?: ToolBindingInput[];
  knowledgeBindings?: string[];
  skillBindings?: string[];
  orchestrationPolicy?: OrchestrationPolicy;
  delegationBindings?: DelegationBindingInput[];
  sharingMode?: AgentSharingMode;
  shareTargetEmail?: string;
  isGlobal?: boolean;
  isRecommended?: boolean;
  curationLabel?: AgentCurationLabel;
  canAdminCurate?: boolean;
  promptSuggestions?: string[];
}

export interface CloneAgentInput {
  agentId: string;
  workspaceId: string;
  userId: string;
  canAdminCurate?: boolean;
  name?: string;
  slug?: string;
}

type AgentToolChoice = "auto" | "required" | "none";
type AgentResponseFormat = "text" | "json_object";

interface AgentGenerationSettings {
  topK?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
  seed?: number;
  maxRetries?: number;
  stopSequences?: string[];
}

interface AgentMemoryPolicy {
  enabled?: boolean;
  maxMessages?: number;
}

interface AgentGuardrails {
  enabled?: boolean;
  blockedTopics?: string[];
}

type AgentApprovalPolicy = AiHubToolApprovalPolicy;

export interface UpdateAgentInput {
  agentId: string;
  workspaceId: string;
  userId: string;
  baseVersionId: string | null;
  name?: string;
  slug?: string;
  description?: string;
  logoUrl?: string | null;
  systemPrompt?: string;
  providerId?: string;
  modelId?: string;
  temperature?: string;
  topP?: string;
  maxOutputTokens?: number;
  maxToolCalls?: number;
  toolChoice?: AgentToolChoice;
  generationSettings?: AgentGenerationSettings;
  responseFormat?: AgentResponseFormat;
  memoryPolicy?: AgentMemoryPolicy;
  guardrails?: AgentGuardrails;
  approvalPolicy?: AgentApprovalPolicy;
  toolBindings?: ToolBindingInput[];
  knowledgeBindings?: string[];
  skillBindings?: string[];
  orchestrationPolicy?: OrchestrationPolicy;
  delegationBindings?: DelegationBindingInput[];
  sharingMode?: AgentSharingMode;
  shareTargetEmail?: string | null;
  isGlobal?: boolean;
  isRecommended?: boolean;
  curationLabel?: AgentCurationLabel;
  canAdminCurate?: boolean;
  promptSuggestions?: string[];
}

export class AgentVersionConflictError extends Error {
  readonly code = "AGENT_VERSION_CONFLICT";

  constructor(readonly currentVersionId: string | null) {
    super("Agent configuration changed since it was loaded");
    this.name = "AgentVersionConflictError";
  }
}

export interface AgentDefaultPreferences {
  organizationDefaultAgentId: string | null;
  userDefaultAgentId: string | null;
  effectiveDefaultAgentId: string | null;
}

async function resolveShareTargetUserId(
  email: string | null | undefined,
): Promise<string | null> {
  if (!email) return null;

  const [target] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email.trim().toLowerCase()))
    .limit(1);

  if (!target) throw new Error("Share target user not found");
  return target.id;
}

async function requireShareTargetUserId(email: string | null | undefined) {
  if (!email?.trim()) throw new Error("Share target user is required");
  return await resolveShareTargetUserId(email);
}

function normalizeCurationLabel(
  label: AgentCurationLabel | undefined,
  isRecommended?: boolean,
) {
  if (label === "none") return null;
  if (label === "organization_created") return label;
  if (isRecommended || label === "recommended") return "recommended";
  return null;
}

function slugifyAgentName(value: string) {
  return (
    value
      .toLowerCase()
      .trim()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 96) || "assistant"
  );
}

export function normalizePromptSuggestions(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean)
    .slice(0, 12);
}

function preparePromptSuggestions(input: string[] | undefined) {
  return normalizePromptSuggestions(input).map((suggestion) =>
    suggestion.slice(0, 240),
  );
}

async function agentSlugExists(workspaceId: string, slug: string) {
  const [existing] = await db
    .select({ id: agents.id })
    .from(agents)
    .where(and(eq(agents.workspaceId, workspaceId), eq(agents.slug, slug)))
    .limit(1);
  return Boolean(existing);
}

async function createAvailableAgentSlug(
  workspaceId: string,
  preferredNameOrSlug: string,
) {
  const base = slugifyAgentName(preferredNameOrSlug).slice(0, 96);
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const suffix = attempt === 0 ? "" : `-${attempt + 1}`;
    const slug = `${base}${suffix}`.slice(0, 128);
    if (!(await agentSlugExists(workspaceId, slug))) return slug;
  }
  return `${base.slice(0, 88)}-${Date.now().toString(36)}`;
}

function stripBuiltinApprovalOverrides(
  bindings: ToolBindingInput[] | undefined,
): ToolBindingInput[] | undefined {
  return bindings?.map((binding) => {
    if (binding.toolSource !== "builtin") return binding;
    return { ...binding, requireApproval: undefined };
  });
}

function getOnboardingToolBindings(): ToolBindingInput[] {
  return ONBOARDING_BUILTIN_TOOL_NAMES.map((name) => {
    const tool = BUILTIN_TOOL_SUMMARIES.find(
      (candidate) => candidate.name === name,
    );
    if (!tool) throw new Error(`Onboarding tool not found: ${name}`);

    return {
      toolSource: "builtin",
      toolId: tool.id,
      requireApproval: false,
    };
  });
}

async function preserveBuiltinApprovalOverrides(
  bindings: ToolBindingInput[] | undefined,
  activeVersionId: string | null,
  visibility: { workspaceId: string; userId: string },
): Promise<ToolBindingInput[] | undefined> {
  if (!bindings || !activeVersionId)
    return stripBuiltinApprovalOverrides(bindings);
  const existingBindings = await getToolBindingsForVersion(
    activeVersionId,
    visibility,
  );
  const builtinApprovalByToolId = new Map(
    existingBindings
      .filter((binding) => binding.toolSource === "builtin")
      .map((binding) => [binding.toolId, binding.requireApproval]),
  );
  return bindings.map((binding) => {
    if (binding.toolSource !== "builtin") return binding;
    return {
      ...binding,
      requireApproval: builtinApprovalByToolId.get(binding.toolId),
    };
  });
}

// ─── Agent CRUD ────────────────────────────────────────────────────────

export async function createAgent(input: CreateAgentInput) {
  const {
    workspaceId,
    userId,
    name,
    slug,
    kind = "assistant",
    description,
    logoUrl,
    systemPrompt,
    providerId,
    modelId,
    temperature,
    topP,
    maxOutputTokens,
    maxToolCalls,
    toolPreset,
    toolBindings,
    knowledgeBindings,
    skillBindings,
    orchestrationPolicy,
    delegationBindings,
    promptSuggestions,
    sharingMode = "personal",
    shareTargetEmail,
    isGlobal,
    isRecommended,
    curationLabel,
    canAdminCurate,
  } = input;

  if (
    kind === "assistant" &&
    (orchestrationPolicy !== undefined || (delegationBindings?.length ?? 0) > 0)
  ) {
    throw new Error("Only orchestrators can configure delegation");
  }
  if (kind === "orchestrator" && sharingMode === "marketplace") {
    throw new Error("Orchestrators cannot be published to the marketplace yet");
  }
  const normalizedOrchestrationPolicy =
    kind === "orchestrator"
      ? normalizeOrchestrationPolicy(orchestrationPolicy)
      : null;

  if (providerId) {
    const [provider] = await db
      .select({ id: aiProviders.id })
      .from(aiProviders)
      .where(
        and(
          eq(aiProviders.id, providerId),
          eq(aiProviders.workspaceId, workspaceId),
          isNull(aiProviders.archivedAt),
        ),
      )
      .limit(1);
    if (!provider) throw new Error("Provider not found");
  }

  if (modelId) {
    if (!providerId) throw new Error("Model requires a provider");
    const [model] = await db
      .select({ id: aiModels.id })
      .from(aiModels)
      .where(
        and(
          eq(aiModels.id, modelId),
          eq(aiModels.providerId, providerId),
          eq(aiModels.enabled, true),
        ),
      )
      .limit(1);
    if (!model) throw new Error("Model not found");
  }

  const shareTargetUserId =
    sharingMode === "specific_user"
      ? await requireShareTargetUserId(shareTargetEmail)
      : null;

  if (toolPreset && toolBindings !== undefined) {
    throw new Error("toolPreset cannot be combined with toolBindings");
  }
  const normalizedToolBindings =
    toolPreset === ONBOARDING_TOOL_PRESET
      ? getOnboardingToolBindings()
      : canAdminCurate
        ? toolBindings
        : stripBuiltinApprovalOverrides(toolBindings);

  const curated = canAdminCurate
    ? {
        isGlobal: Boolean(isGlobal),
        isRecommended: Boolean(isRecommended),
        curationLabel: normalizeCurationLabel(curationLabel, isRecommended),
      }
    : {
        isGlobal: false,
        isRecommended: false,
        curationLabel: null,
      };

  const { agent, version } = await db.transaction(async (tx) => {
    const [agent] = await tx
      .insert(agents)
      .values({
        workspaceId,
        name,
        slug,
        description: description || null,
        logoUrl: logoUrl ?? null,
        promptSuggestionsJson: preparePromptSuggestions(promptSuggestions),
        createdById: userId,
        visibility: sharingMode === "marketplace" ? "public" : "private",
        sourceType: "custom",
        kind,
        sharingMode,
        shareTargetUserId,
        ...curated,
      })
      .returning();

    const [version] = await tx
      .insert(agentVersions)
      .values({
        agentId: agent.id,
        versionNumber: 1,
        name: "Initial version",
        systemPrompt: systemPrompt || null,
        providerId: providerId || null,
        modelId: modelId || null,
        temperature: temperature || null,
        topP: topP || null,
        maxOutputTokens: maxOutputTokens ?? 30_000,
        maxToolCalls: maxToolCalls ?? 20,
        orchestrationPolicyJson: normalizedOrchestrationPolicy,
        createdById: userId,
      })
      .returning();

    await tx
      .update(agents)
      .set({ activeVersionId: version.id })
      .where(eq(agents.id, agent.id));

    await insertToolBindingsForVersion(
      version.id,
      normalizedToolBindings ?? [],
      workspaceId,
      { userId },
      tx,
    );
    await replaceKnowledgeBindingsForVersion(
      version.id,
      knowledgeBindings ?? [],
      workspaceId,
      { userId },
      tx,
    );
    await replaceSkillBindingsForVersion(
      version.id,
      workspaceId,
      skillBindings ?? [],
      { userId },
      tx,
    );
    if (normalizedOrchestrationPolicy) {
      await insertDelegationBindingsForVersion({
        parentAgentId: agent.id,
        agentVersionId: version.id,
        workspaceId,
        userId,
        bindings: delegationBindings ?? [],
        policy: normalizedOrchestrationPolicy,
        executor: tx,
      });
    }

    return {
      agent: { ...agent, activeVersionId: version.id },
      version,
    };
  });

  await audit.emit({
    workspaceId,
    actorPrincipalType: "user",
    actorPrincipalId: userId,
    action: "agent.created",
    resourceType: "agent",
    resourceId: agent.id,
    outcome: "success",
    metadata: { name, slug, kind, sharingMode },
  });

  logger.info("Agent created", { agentId: agent.id, userId });
  return { agent, version };
}

export async function getAgentById(
  agentId: string,
  workspaceId: string,
): Promise<typeof agents.$inferSelect | null> {
  const [agent] = await db
    .select()
    .from(agents)
    .where(
      and(
        eq(agents.id, agentId),
        eq(agents.workspaceId, workspaceId),
        isNull(agents.archivedAt),
      ),
    )
    .limit(1);

  return agent || null;
}

export async function getVisibleAgentById(
  agentId: string,
  workspaceId: string,
  userId: string,
  canAdminCurate: boolean,
) {
  // Admin curation does not grant access to another user's personal agents.
  void canAdminCurate;
  const agent = await getAgentById(agentId, workspaceId);
  if (!agent) return null;
  if (canUseAgent(agent, userId)) return agent;
  return null;
}

export function listAgents(
  workspaceId: string,
  userId: string,
  canAdminCurate: boolean,
) {
  // Keep user-facing lists scoped to agents the current user can actually use.
  void canAdminCurate;
  const visibilityFilter = or(
    eq(agents.createdById, userId),
    eq(agents.isGlobal, true),
    eq(agents.sharingMode, "marketplace"),
    and(
      eq(agents.sharingMode, "specific_user"),
      eq(agents.shareTargetUserId, userId),
    ),
  );

  return db
    .select()
    .from(agents)
    .where(
      and(
        eq(agents.workspaceId, workspaceId),
        isNull(agents.archivedAt),
        visibilityFilter,
      ),
    )
    .orderBy(
      sql`${agents.isGlobal} DESC`,
      sql`${agents.organizationDisplayOrder} ASC`,
      sql`${agents.isRecommended} DESC`,
      sql`${agents.updatedAt} DESC`,
    );
}

export function canUseAgent(agent: AgentRow, userId: string) {
  return (
    agent.createdById === userId ||
    agent.isGlobal ||
    agent.sharingMode === "marketplace" ||
    (agent.sharingMode === "specific_user" &&
      agent.shareTargetUserId === userId)
  );
}

export function canEditAgent(
  agent: AgentRow,
  userId: string,
  canAdminCurate = false,
) {
  return agent.createdById === userId || (agent.isGlobal && canAdminCurate);
}

export async function getAgentDefaultPreferences(
  workspaceId: string,
  userId: string,
  availableAgentIds?: Set<string>,
): Promise<AgentDefaultPreferences> {
  const [organizationDefault] = await db
    .select({ id: agents.id })
    .from(agents)
    .where(
      and(
        eq(agents.workspaceId, workspaceId),
        eq(agents.isOrganizationDefault, true),
        isNull(agents.archivedAt),
      ),
    )
    .limit(1);
  const [userPreference] = await db
    .select({ defaultAgentId: userAgentPreferences.defaultAgentId })
    .from(userAgentPreferences)
    .where(
      and(
        eq(userAgentPreferences.workspaceId, workspaceId),
        eq(userAgentPreferences.userId, userId),
      ),
    )
    .limit(1);

  const organizationDefaultAgentId = organizationDefault?.id ?? null;
  const userDefaultAgentId = userPreference?.defaultAgentId ?? null;
  const usableOrganizationDefault =
    organizationDefaultAgentId &&
    (!availableAgentIds || availableAgentIds.has(organizationDefaultAgentId))
      ? organizationDefaultAgentId
      : null;
  const usableUserDefault =
    userDefaultAgentId &&
    (!availableAgentIds || availableAgentIds.has(userDefaultAgentId))
      ? userDefaultAgentId
      : null;

  return {
    organizationDefaultAgentId: usableOrganizationDefault,
    userDefaultAgentId: usableUserDefault,
    effectiveDefaultAgentId: usableUserDefault ?? usableOrganizationDefault,
  };
}

export async function setUserDefaultAgent(input: {
  workspaceId: string;
  userId: string;
  agentId: string | null;
  canAdminCurate?: boolean;
}) {
  if (!input.agentId) {
    await db
      .delete(userAgentPreferences)
      .where(
        and(
          eq(userAgentPreferences.workspaceId, input.workspaceId),
          eq(userAgentPreferences.userId, input.userId),
        ),
      );
    return getAgentDefaultPreferences(input.workspaceId, input.userId);
  }

  const agent = await getVisibleAgentById(
    input.agentId,
    input.workspaceId,
    input.userId,
    Boolean(input.canAdminCurate),
  );
  if (!agent) throw new Error("Agent not found");

  await db
    .insert(userAgentPreferences)
    .values({
      workspaceId: input.workspaceId,
      userId: input.userId,
      defaultAgentId: input.agentId,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [userAgentPreferences.workspaceId, userAgentPreferences.userId],
      set: { defaultAgentId: input.agentId, updatedAt: new Date() },
    });

  return getAgentDefaultPreferences(input.workspaceId, input.userId);
}

export async function setOrganizationDefaultAgent(input: {
  workspaceId: string;
  userId: string;
  agentId: string | null;
}) {
  if (input.agentId) {
    const [agent] = await db
      .select()
      .from(agents)
      .where(
        and(
          eq(agents.id, input.agentId),
          eq(agents.workspaceId, input.workspaceId),
          isNull(agents.archivedAt),
        ),
      )
      .limit(1);
    if (!agent) {
      throw new Error("Organization assistant not found");
    }
    const canBeOrganizationDefault = agent.isGlobal || agent.isRecommended;
    if (!canBeOrganizationDefault) {
      throw new Error("Organization assistant not found");
    }
  }

  await db.transaction(async (tx) => {
    await tx
      .update(agents)
      .set({ isOrganizationDefault: false, updatedAt: new Date() })
      .where(eq(agents.workspaceId, input.workspaceId));
    if (input.agentId) {
      await tx
        .update(agents)
        .set({ isOrganizationDefault: true, updatedAt: new Date() })
        .where(eq(agents.id, input.agentId));
    }
  });

  await audit.emit({
    workspaceId: input.workspaceId,
    actorPrincipalType: "user",
    actorPrincipalId: input.userId,
    action: "agent.organization_default.updated",
    resourceType: "agent",
    resourceId: input.agentId ?? input.workspaceId,
    outcome: "success",
    metadata: { agentId: input.agentId },
  });

  return getAgentDefaultPreferences(input.workspaceId, input.userId);
}

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

async function getActiveVersionConfig(
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

async function updateAgentUnlocked(input: UpdateAgentInput) {
  const {
    agentId,
    workspaceId,
    userId,
    baseVersionId,
    name,
    slug,
    description,
    logoUrl,
    systemPrompt,
    providerId,
    modelId,
    temperature,
    topP,
    maxOutputTokens,
    maxToolCalls,
    toolBindings,
    knowledgeBindings,
    skillBindings,
    orchestrationPolicy,
    delegationBindings,
    sharingMode,
    shareTargetEmail,
    isGlobal,
    isRecommended,
    curationLabel,
    canAdminCurate,
    toolChoice,
    generationSettings,
    responseFormat,
    memoryPolicy,
    guardrails,
    approvalPolicy,
    promptSuggestions,
  } = input;

  const [existing] = await db
    .select()
    .from(agents)
    .where(and(eq(agents.id, agentId), eq(agents.workspaceId, workspaceId)))
    .limit(1);

  if (!existing) {
    throw new Error("Agent not found");
  }

  if (!canEditAgent(existing, userId, Boolean(canAdminCurate))) {
    throw new Error("Only the creator or an admin can update this agent");
  }
  if (existing.activeVersionId !== baseVersionId) {
    throw new AgentVersionConflictError(existing.activeVersionId);
  }
  if (
    existing.kind === "assistant" &&
    (orchestrationPolicy !== undefined || (delegationBindings?.length ?? 0) > 0)
  ) {
    throw new Error("Only orchestrators can configure delegation");
  }
  if (
    existing.kind === "orchestrator" &&
    (sharingMode ?? existing.sharingMode) === "marketplace"
  ) {
    throw new Error("Orchestrators cannot be published to the marketplace yet");
  }

  const normalizedToolBindings = canAdminCurate
    ? toolBindings
    : await preserveBuiltinApprovalOverrides(
        toolBindings,
        existing.activeVersionId,
        {
          workspaceId,
          userId,
        },
      );

  const nextShareTargetUserId =
    sharingMode === "specific_user"
      ? await requireShareTargetUserId(shareTargetEmail)
      : sharingMode
        ? null
        : existing.shareTargetUserId;

  const { agent, version } = await db.transaction(async (tx) => {
    const activeVersionPredicate = baseVersionId
      ? eq(agents.activeVersionId, baseVersionId)
      : isNull(agents.activeVersionId);
    const [lockedAgent] = await tx
      .update(agents)
      .set({ updatedAt: sql`${agents.updatedAt}` })
      .where(
        and(
          eq(agents.id, agentId),
          eq(agents.workspaceId, workspaceId),
          activeVersionPredicate,
        ),
      )
      .returning();
    if (!lockedAgent) {
      const [current] = await tx
        .select({ activeVersionId: agents.activeVersionId })
        .from(agents)
        .where(and(eq(agents.id, agentId), eq(agents.workspaceId, workspaceId)))
        .limit(1);
      if (!current) throw new Error("Agent not found");
      throw new AgentVersionConflictError(current.activeVersionId);
    }

    const agentUpdates: Record<string, unknown> = { updatedAt: new Date() };
    if (name !== undefined) agentUpdates.name = name;
    if (slug !== undefined) agentUpdates.slug = slug;
    if (description !== undefined) agentUpdates.description = description;
    if (logoUrl !== undefined) agentUpdates.logoUrl = logoUrl ?? null;
    if (promptSuggestions !== undefined) {
      agentUpdates.promptSuggestionsJson =
        preparePromptSuggestions(promptSuggestions);
    }
    if (sharingMode !== undefined) {
      agentUpdates.sharingMode = sharingMode;
      agentUpdates.shareTargetUserId = nextShareTargetUserId;
      agentUpdates.visibility =
        sharingMode === "marketplace" ? "public" : "private";
    }
    if (canAdminCurate) {
      if (isGlobal !== undefined) agentUpdates.isGlobal = isGlobal;
      if (isRecommended !== undefined) {
        agentUpdates.isRecommended = isRecommended;
      }
      if (curationLabel !== undefined || isRecommended !== undefined) {
        agentUpdates.curationLabel = normalizeCurationLabel(
          curationLabel,
          isRecommended ?? existing.isRecommended,
        );
      }
    }

    if (Object.keys(agentUpdates).length > 1) {
      await tx.update(agents).set(agentUpdates).where(eq(agents.id, agentId));
    }

    // Get active version config for inheritance
    const activeConfig = await getActiveVersionConfig(tx, baseVersionId);

    const nextProviderId =
      providerId !== undefined
        ? providerId
        : (activeConfig?.providerId ?? null);
    const nextModelId =
      modelId !== undefined
        ? modelId
        : providerId !== undefined
          ? null
          : (activeConfig?.modelId ?? null);
    const nextOrchestrationPolicy =
      existing.kind === "orchestrator"
        ? normalizeOrchestrationPolicy(
            orchestrationPolicy ?? activeConfig?.orchestrationPolicyJson,
          )
        : null;

    if (nextProviderId) {
      const [provider] = await tx
        .select({ id: aiProviders.id })
        .from(aiProviders)
        .where(
          and(
            eq(aiProviders.id, nextProviderId),
            eq(aiProviders.workspaceId, workspaceId),
            isNull(aiProviders.archivedAt),
          ),
        )
        .limit(1);
      if (!provider) throw new Error("Provider not found");
    }

    if (nextModelId) {
      if (!nextProviderId) throw new Error("Model requires a provider");
      const [model] = await tx
        .select({ id: aiModels.id })
        .from(aiModels)
        .where(
          and(
            eq(aiModels.id, nextModelId),
            eq(aiModels.providerId, nextProviderId),
            eq(aiModels.enabled, true),
          ),
        )
        .limit(1);
      if (!model) throw new Error("Model not found");
    }

    // Get next version number
    const [row] = await tx
      .select({ maxVersion: max(agentVersions.versionNumber) })
      .from(agentVersions)
      .where(eq(agentVersions.agentId, agentId));

    const nextVersion = (row?.maxVersion ?? 0) + 1;

    const [version] = await tx
      .insert(agentVersions)
      .values({
        agentId,
        versionNumber: nextVersion,
        name: `Version ${nextVersion}`,
        systemPrompt:
          systemPrompt !== undefined
            ? systemPrompt
            : (activeConfig?.systemPrompt ?? null),
        providerId: nextProviderId,
        modelId: nextModelId,
        temperature:
          temperature !== undefined
            ? temperature
            : (activeConfig?.temperature ?? null),
        topP: topP !== undefined ? topP : (activeConfig?.topP ?? null),
        maxOutputTokens:
          maxOutputTokens !== undefined
            ? maxOutputTokens
            : (activeConfig?.maxOutputTokens ?? null),
        maxToolCalls:
          maxToolCalls !== undefined
            ? maxToolCalls
            : (activeConfig?.maxToolCalls ?? 20),
        toolChoice:
          toolChoice !== undefined
            ? toolChoice
            : (activeConfig?.toolChoice ?? null),
        generationSettingsJson:
          generationSettings !== undefined
            ? generationSettings
            : (activeConfig?.generationSettingsJson ?? null),
        responseFormatJson:
          responseFormat !== undefined
            ? { type: responseFormat }
            : (activeConfig?.responseFormatJson ?? null),
        memoryPolicyJson:
          memoryPolicy !== undefined
            ? memoryPolicy
            : (activeConfig?.memoryPolicyJson ?? null),
        guardrailsJson:
          guardrails !== undefined
            ? guardrails
            : (activeConfig?.guardrailsJson ?? null),
        approvalPolicyJson:
          approvalPolicy !== undefined
            ? approvalPolicy
            : (activeConfig?.approvalPolicyJson ?? null),
        orchestrationPolicyJson: nextOrchestrationPolicy,
        createdById: userId,
      })
      .returning();

    if (normalizedToolBindings !== undefined) {
      await insertToolBindingsForVersion(
        version.id,
        normalizedToolBindings,
        workspaceId,
        { userId },
        tx,
      );
    } else {
      await cloneToolBindings(
        baseVersionId,
        version.id,
        workspaceId,
        {
          userId,
        },
        tx,
      );
    }

    if (knowledgeBindings !== undefined) {
      await replaceKnowledgeBindingsForVersion(
        version.id,
        knowledgeBindings,
        workspaceId,
        { userId },
        tx,
      );
    } else {
      await cloneKnowledgeBindings(
        baseVersionId,
        version.id,
        workspaceId,
        { userId },
        tx,
      );
    }

    if (skillBindings !== undefined) {
      await replaceSkillBindingsForVersion(
        version.id,
        workspaceId,
        skillBindings,
        { userId },
        tx,
      );
    } else {
      await cloneSkillBindings(
        baseVersionId,
        version.id,
        workspaceId,
        { userId },
        tx,
      );
    }

    if (nextOrchestrationPolicy) {
      if (delegationBindings !== undefined) {
        await insertDelegationBindingsForVersion({
          parentAgentId: agentId,
          agentVersionId: version.id,
          workspaceId,
          userId,
          bindings: delegationBindings,
          policy: nextOrchestrationPolicy,
          executor: tx,
        });
      } else {
        await cloneDelegationBindings({
          fromAgentVersionId: baseVersionId,
          toAgentVersionId: version.id,
          parentAgentId: agentId,
          workspaceId,
          userId,
          policy: nextOrchestrationPolicy,
          executor: tx,
        });
      }
    }

    await tx
      .update(agents)
      .set({ activeVersionId: version.id, updatedAt: new Date() })
      .where(eq(agents.id, agentId));

    const [updatedAgent] = await tx
      .select()
      .from(agents)
      .where(eq(agents.id, agentId))
      .limit(1);

    return { agent: updatedAgent, version };
  });

  await audit.emit({
    workspaceId,
    actorPrincipalType: "user",
    actorPrincipalId: userId,
    action: "agent.updated",
    resourceType: "agent",
    resourceId: agentId,
    outcome: "success",
    metadata: {
      versionNumber: version.versionNumber,
      sharingMode: sharingMode ?? existing.sharingMode,
    },
  });

  logger.info("Agent updated", {
    agentId,
    versionNumber: version.versionNumber,
    userId,
  });
  return { agent, version };
}

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

  if (!canEditAgent(existing, userId, canAdminCurate)) {
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

export async function getConversationMessages(conversationId: string) {
  const messageRows = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(messages.createdAt);

  if (messageRows.length === 0) return [];

  const partsByMessageId = new Map<
    string,
    Array<typeof messageParts.$inferSelect>
  >();
  const parts = await db
    .select()
    .from(messageParts)
    .where(
      inArray(
        messageParts.messageId,
        messageRows.map((message) => message.id),
      ),
    )
    .orderBy(messageParts.messageId, messageParts.sortOrder);

  for (const part of parts) {
    const existing = partsByMessageId.get(part.messageId);
    if (existing) {
      existing.push(part);
    } else {
      partsByMessageId.set(part.messageId, [part]);
    }
  }

  async function renderMessagePart(
    part: typeof messageParts.$inferSelect,
  ): Promise<{ type: string; content: string }> {
    if (
      (part.type === "text" ||
        part.type === "reasoning" ||
        part.type === "suggestions" ||
        part.type === "citations") &&
      part.contentEncrypted
    ) {
      try {
        const content = await decryptValue(part.contentEncrypted);
        return { type: part.type, content };
      } catch {
        return {
          type: part.type,
          content: "[decryption failed]",
        };
      }
    }
    if (part.type === "tool-call" || part.type === "tool-result") {
      return {
        type: part.type,
        content: JSON.stringify(projectToolMessagePayload(part.metadataJson)),
      };
    }

    return {
      type: part.type,
      content: part.metadataJson
        ? JSON.stringify(part.metadataJson)
        : (part.contentEncrypted ?? ""),
    };
  }

  return Promise.all(
    messageRows.map(async (msg) => ({
      id: msg.id,
      role: msg.role,
      status: msg.status,
      parts: await Promise.all(
        (partsByMessageId.get(msg.id) ?? []).map(renderMessagePart),
      ),
      createdAt: msg.createdAt.toISOString(),
    })),
  );
}

// ─── Usage Tracking ────────────────────────────────────────────────────

export async function recordUsageEvent(input: {
  workspaceId: string;
  userId: string;
  providerId?: string;
  modelId?: string;
  agentId?: string;
  conversationId?: string;
  operation: string;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: string;
  latencyMs?: number;
  status?: string;
}) {
  try {
    await db.insert(usageEvents).values({
      workspaceId: input.workspaceId,
      userId: input.userId,
      providerId: input.providerId || null,
      modelId: input.modelId || null,
      agentId: input.agentId || null,
      conversationId: input.conversationId || null,
      operation: input.operation,
      inputTokens: input.inputTokens || null,
      outputTokens: input.outputTokens || null,
      costUsd: input.costUsd || null,
      latencyMs: input.latencyMs || null,
      status: input.status || null,
    });
  } catch (error) {
    logHandledError("Failed to record usage event", {}, error as Error);
  }
}
