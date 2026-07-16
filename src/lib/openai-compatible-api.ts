export const OPENAI_COMPATIBLE_API_ROUTES = [
  "responses",
  "chat-completions",
] as const;

export type OpenAICompatibleApiRoute =
  (typeof OPENAI_COMPATIBLE_API_ROUTES)[number];

export const DEFAULT_OPENAI_COMPATIBLE_API_ROUTE: OpenAICompatibleApiRoute =
  "responses";

export function normalizeOpenAICompatibleApiRoute(
  value: unknown,
): OpenAICompatibleApiRoute {
  return value === "chat-completions"
    ? "chat-completions"
    : DEFAULT_OPENAI_COMPATIBLE_API_ROUTE;
}
