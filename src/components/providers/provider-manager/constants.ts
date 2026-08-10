import {
  CloudIcon,
  CpuIcon,
  NetworkIcon,
  PlugIcon,
  SparklesIcon,
} from "lucide-react";
import type { ElementType } from "react";

import type { OpenAICompatibilityProfile } from "@/lib/openai-compatibility-profile";
import type { ProviderAuthType, ProviderKind } from "./types";

export const KIND_LABELS: Record<ProviderKind, string> = {
  "openai-compatible": "OpenAI-compatible",
  "anthropic-compatible": "Anthropic-compatible",
  dragonfly: "Dragonfly",
  "vercel-ai-gateway": "Vercel AI Gateway",
  native: "Native",
};

export const OPENAI_COMPATIBILITY_PROFILE_LABELS: Record<
  OpenAICompatibilityProfile,
  string
> = {
  auto: "Auto-detect",
  generic: "Generic OpenAI",
  "llama.cpp": "llama.cpp",
  vllm: "vLLM",
  "open-webui": "Open WebUI",
};

export const AUTH_TYPE_LABELS: Record<ProviderAuthType, string> = {
  bearer: "Bearer token",
  "x-api-key": "X-API-KEY header",
  "custom-header": "Custom headers only",
  gateway: "Gateway bearer token",
};

export const KIND_ICONS: Record<ProviderKind, ElementType> = {
  "openai-compatible": PlugIcon,
  "anthropic-compatible": SparklesIcon,
  dragonfly: CloudIcon,
  "vercel-ai-gateway": NetworkIcon,
  native: CpuIcon,
};

export function kindAccent(kind: ProviderKind) {
  void kind;
  return {
    bar: "bg-primary",
    bg: "bg-primary/5",
    text: "text-primary",
    ring: "ring-primary/20",
    badge: "bg-primary/10 text-primary",
    iconBg: "bg-primary/10",
  };
}
