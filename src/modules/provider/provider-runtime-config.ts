import { decryptValue } from "@/lib/crypto";
import { normalizeOpenAICompatibleApiRoute } from "@/lib/openai-compatible-api";
import type { aiProviders } from "@/server/infrastructure/db/schema";
import type { ProviderRuntimeConfig } from "@/server/infrastructure/providers";

export async function buildProviderRuntimeConfig(
  provider: typeof aiProviders.$inferSelect,
): Promise<ProviderRuntimeConfig> {
  const apiKey = provider.encryptedApiKey
    ? await decryptValue(provider.encryptedApiKey)
    : undefined;
  const headers: Record<string, string> = {};
  for (const [key, encryptedValue] of Object.entries(
    (provider.encryptedHeadersJson as Record<string, string> | null) ?? {},
  )) {
    headers[key] = await decryptValue(encryptedValue);
  }
  return {
    kind: provider.kind,
    name: provider.name,
    baseUrl: provider.baseUrl ?? undefined,
    authType: provider.authType,
    apiKey,
    headers: Object.keys(headers).length ? headers : undefined,
    queryParams:
      (provider.queryParamsJson as Record<string, string> | null) ?? undefined,
    openaiCompatibleApiRoute: normalizeOpenAICompatibleApiRoute(
      provider.openaiCompatibleApiRoute,
    ),
  };
}
