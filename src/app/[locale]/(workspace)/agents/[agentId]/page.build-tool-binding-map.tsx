"use client";

import type { DelegationConfig, ToolBinding, ToolBindingState } from "./types";

export function buildToolBindingMap<T extends { id: string }>(
  tools: T[],
  bindings: ToolBinding[],
  source: "builtin" | "mcp" | "custom",
  defaultApproval: (tool: T) => boolean,
): ToolBindingState {
  const bindingsByToolId = new Map(
    bindings
      .filter((binding) => binding.toolSource === source)
      .map((binding) => [binding.toolId, binding]),
  );
  const map: ToolBindingState = {};
  for (const tool of tools) {
    const binding = bindingsByToolId.get(tool.id);
    map[tool.id] = {
      enabled: Boolean(binding),
      requireApproval: binding?.requireApproval ?? defaultApproval(tool),
    };
  }
  return map;
}

export async function agentSaveError(
  response: Response,
  fallback: string,
  conflictMessage: string,
) {
  const payload = (await response.json().catch(() => null)) as {
    error?: string;
    code?: string;
  } | null;
  return payload?.code === "AGENT_VERSION_CONFLICT"
    ? conflictMessage
    : (payload?.error ?? fallback);
}

export const defaultDelegationConfig: DelegationConfig = {
  version: null,
  policy: {
    maxDepth: 2,
    maxDelegations: 4,
    maxParallel: 2,
    maxChildSteps: 8,
    maxTotalTokens: 50_000,
    timeoutMs: 60_000,
    resultMaxChars: 8_000,
  },
  bindings: [],
};
