export const OPENAI_COMPATIBILITY_PROFILES = [
  "auto",
  "generic",
  "llama.cpp",
  "vllm",
  "open-webui",
] as const;

export type OpenAICompatibilityProfile =
  (typeof OPENAI_COMPATIBILITY_PROFILES)[number];

export const DEFAULT_OPENAI_COMPATIBILITY_PROFILE: OpenAICompatibilityProfile =
  "auto";

export function normalizeOpenAICompatibilityProfile(
  value: unknown,
): OpenAICompatibilityProfile {
  return OPENAI_COMPATIBILITY_PROFILES.includes(
    value as OpenAICompatibilityProfile,
  )
    ? (value as OpenAICompatibilityProfile)
    : DEFAULT_OPENAI_COMPATIBILITY_PROFILE;
}

export function shouldNormalizeResponsesInputBeforeRequest(
  profile: OpenAICompatibilityProfile,
) {
  return profile === "llama.cpp";
}
