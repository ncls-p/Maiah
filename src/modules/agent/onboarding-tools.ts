export const ONBOARDING_TOOL_PRESET = "onboarding" as const;

export const ONBOARDING_BUILTIN_TOOL_NAMES = [
  "calculator",
  "current_time",
  "random_number",
  "uuid_generator",
  "date_math",
  "web_search",
] as const;

export type AgentToolPreset = typeof ONBOARDING_TOOL_PRESET;
