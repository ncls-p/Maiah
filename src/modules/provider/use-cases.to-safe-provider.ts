import { prepareBedrockSettings, type BedrockInput } from "./bedrock-settings";
import { encryptValue } from "@/lib/crypto";
import { logger } from "@/lib/logger";
import {
  DEFAULT_OPENAI_COMPATIBLE_API_ROUTE,
  normalizeOpenAICompatibleApiRoute,
  type OpenAICompatibleApiRoute,
} from "@/lib/openai-compatible-api";
import {
  DEFAULT_OPENAI_COMPATIBILITY_PROFILE,
  normalizeOpenAICompatibilityProfile,
  type OpenAICompatibilityProfile,
} from "@/lib/openai-compatibility-profile";
import { audit } from "@/server/domain/services/audit";
import { db } from "@/server/infrastructure/db";
import {
  aiProviders,
  providerAuthTypeEnum,
  providerKindEnum,
} from "@/server/infrastructure/db/schema";

// ─── Provider CRUD ─────────────────────────────────────────────────────

type ProviderKind = (typeof providerKindEnum.enumValues)[number];
type ProviderAuthType = (typeof providerAuthTypeEnum.enumValues)[number];
type ProviderRow = typeof aiProviders.$inferSelect;

export function toSafeProvider(
  provider: ProviderRow,
  includeConnectionDetails = true,
) {
  return {
    id: provider.id,
    workspaceId: provider.workspaceId,
    kind: provider.kind,
    name: provider.name,
    description: provider.description,
    tags: provider.tags,
    baseUrl: includeConnectionDetails ? provider.baseUrl : null,
    authType: provider.authType,
    bedrockConfig:
      provider.kind === "amazon-bedrock"
        ? (provider.bedrockConfigJson as {
            region: string;
            authMode: "api-key" | "iam";
          })
        : null,
    hasAwsCredentials: Boolean(provider.encryptedAwsCredentials),
    queryParamsJson: includeConnectionDetails ? provider.queryParamsJson : null,
    openaiCompatibleApiRoute: normalizeOpenAICompatibleApiRoute(
      provider.openaiCompatibleApiRoute,
    ),
    openaiCompatibilityProfile: normalizeOpenAICompatibilityProfile(
      provider.openaiCompatibilityProfile,
    ),
    enabled: provider.enabled,
    healthStatus: provider.healthStatus,
    lastCheckedAt: provider.lastCheckedAt,
    createdById: provider.createdById,
    createdAt: provider.createdAt,
    updatedAt: provider.updatedAt,
    archivedAt: provider.archivedAt,
    hasApiKey: Boolean(provider.encryptedApiKey),
    hasCustomHeaders: Boolean(provider.encryptedHeadersJson),
  };
}

export interface CreateProviderInput {
  workspaceId: string;
  userId: string;
  kind: ProviderKind;
  name: string;
  description?: string;
  tags?: string[];
  baseUrl?: string;
  authType: ProviderAuthType;
  apiKey?: string;
  bedrock?: BedrockInput;
  headersJson?: Record<string, string>;
  queryParamsJson?: Record<string, string>;
  openaiCompatibleApiRoute?: OpenAICompatibleApiRoute;
  openaiCompatibilityProfile?: OpenAICompatibilityProfile;
}

export async function createProvider(input: CreateProviderInput) {
  const {
    workspaceId,
    userId,
    kind,
    name,
    baseUrl,
    authType,
    apiKey,
    headersJson,
    queryParamsJson,
    openaiCompatibleApiRoute = DEFAULT_OPENAI_COMPATIBLE_API_ROUTE,
    openaiCompatibilityProfile = DEFAULT_OPENAI_COMPATIBILITY_PROFILE,
  } = input;

  const bedrockValues =
    kind === "amazon-bedrock"
      ? await prepareBedrockSettings(input.bedrock, apiKey)
      : {};
  const encryptedApiKey =
    apiKey && !(kind === "amazon-bedrock" && input.bedrock?.authMode === "iam")
      ? await encryptValue(apiKey)
      : null;

  let encryptedHeadersJson: Record<string, string> | null = null;
  if (headersJson && Object.keys(headersJson).length > 0) {
    encryptedHeadersJson = {};
    for (const [k, v] of Object.entries(headersJson)) {
      encryptedHeadersJson[k] = await encryptValue(v);
    }
  }

  const [provider] = await db
    .insert(aiProviders)
    .values({
      workspaceId,
      createdById: userId,
      kind,
      name,
      description: input.description,
      tags: input.tags,
      baseUrl: baseUrl || null,
      authType,
      encryptedApiKey,
      ...bedrockValues,
      encryptedHeadersJson,
      queryParamsJson: queryParamsJson || null,
      openaiCompatibleApiRoute,
      openaiCompatibilityProfile,
      enabled: true,
    })
    .returning();

  await audit.emit({
    workspaceId,
    actorPrincipalType: "user",
    actorPrincipalId: userId,
    action: "provider.created",
    resourceType: "provider",
    resourceId: provider.id,
    outcome: "success",
    metadata: { kind, name },
  });

  logger.info("Provider created", { providerId: provider.id, userId });
  return provider;
}

export interface UpdateProviderInput {
  providerId: string;
  workspaceId: string;
  userId: string;
  name?: string;
  description?: string;
  tags?: string[];
  baseUrl?: string;
  apiKey?: string;
  bedrock?: BedrockInput;
  headersJson?: Record<string, string>;
  queryParamsJson?: Record<string, string>;
  openaiCompatibleApiRoute?: OpenAICompatibleApiRoute;
  openaiCompatibilityProfile?: OpenAICompatibilityProfile;
  enabled?: boolean;
}
