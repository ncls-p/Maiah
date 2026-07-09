export const agentRuntimePolicy = {
  defaultMaxOutputTokens: 30_000,
  maxOutputTokens: 100_000,
  maxToolCalls: 50,
  stepOverhead: 2,
  chatTimeoutMs: 120_000,
  automationTimeoutMs: 30_000,
  customToolBuilderMaxSteps: 12,
  customToolBuilderMaxActions: 20,
  customToolBuilderMaxOutputTokens: 4_000,
  customToolBuilderTimeoutMs: 120_000,
} as const;

function boundedInteger(value: number | null | undefined, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.floor(value as number));
}

export function resolveAgentRuntimeLimits(input: {
  maxToolCalls?: number | null;
  maxOutputTokens?: number | null;
}) {
  const maxToolCalls = Math.min(
    boundedInteger(input.maxToolCalls, 20),
    agentRuntimePolicy.maxToolCalls,
  );
  const maxOutputTokens = Math.max(
    1,
    Math.min(
      boundedInteger(
        input.maxOutputTokens,
        agentRuntimePolicy.defaultMaxOutputTokens,
      ),
      agentRuntimePolicy.maxOutputTokens,
    ),
  );
  return {
    maxToolCalls,
    maxOutputTokens,
    maxSteps:
      maxToolCalls === 0 ? 1 : maxToolCalls + agentRuntimePolicy.stepOverhead,
  };
}

export function createRuntimeDeadline(
  timeoutMs: number,
  parentSignal?: AbortSignal,
) {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  return {
    timeoutSignal,
    signal: parentSignal
      ? AbortSignal.any([parentSignal, timeoutSignal])
      : timeoutSignal,
  };
}
