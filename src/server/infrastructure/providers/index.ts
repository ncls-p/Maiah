import type { ProviderAdapter, ProviderKind } from "./adapter";
import { anthropicCompatibleAdapter } from "./anthropic-compatible-adapter";
import { dragonflyAdapter } from "./dragonfly-adapter";
import { openaiCompatibleAdapter } from "./openai-compatible-adapter";
import { vercelAiGatewayAdapter } from "./vercel-ai-gateway-adapter";

const ADAPTERS: Record<ProviderKind, ProviderAdapter> = {
  "openai-compatible": openaiCompatibleAdapter,
  "anthropic-compatible": anthropicCompatibleAdapter,
  dragonfly: dragonflyAdapter,
  "vercel-ai-gateway": vercelAiGatewayAdapter,
  native: openaiCompatibleAdapter, // fallback
};

export function getAdapter(kind: ProviderKind): ProviderAdapter {
  return ADAPTERS[kind] ?? openaiCompatibleAdapter;
}

export type {
  ModelDescriptor,
  ProviderAdapter,
  ProviderHealth,
  ProviderKind,
  ProviderRuntimeConfig,
} from "./adapter";
