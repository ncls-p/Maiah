import { registerAiSdkDevTools } from "@/server/infrastructure/ai-sdk/devtools";

registerAiSdkDevTools();

export function accumulateTokenCount(
  previous: number | null,
  current: number | undefined,
) {
  const total = (previous ?? 0) + (current ?? 0);
  return total > 0 ? total : null;
}
