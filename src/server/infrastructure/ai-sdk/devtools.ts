import { DevToolsTelemetry } from "@ai-sdk/devtools";
import { registerTelemetry } from "ai";

import { logHandledWarning } from "@/lib/logger";

const globalForAiSdkDevTools = globalThis as typeof globalThis & {
  __aiHubAiSdkDevToolsRegistered?: boolean;
};

/**
 * Register AI SDK DevTools telemetry for local debugging only.
 *
 * DevTools captures raw generateText/streamText/ToolLoopAgent payloads globally
 * once registered. It is therefore explicit opt-in in local development and is
 * never registered in production.
 */
export function registerAiSdkDevTools() {
  if (globalForAiSdkDevTools.__aiHubAiSdkDevToolsRegistered) return;
  const explicitlyEnabled = process.env.AI_SDK_DEVTOOLS === "true";
  if (!explicitlyEnabled || process.env.NODE_ENV === "production") return;

  try {
    registerTelemetry(DevToolsTelemetry());
    globalForAiSdkDevTools.__aiHubAiSdkDevToolsRegistered = true;
  } catch (error) {
    logHandledWarning("Failed to register AI SDK DevTools telemetry", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
