export const agentRuntimePolicy = {
  defaultMaxOutputTokens: 30_000,
  stepOverhead: 2,
  // A generation must eventually reach a terminal state. The stream lease
  // catches crashed producers; this cap also covers a provider connection that
  // remains open forever without producing a result.
  chatTimeoutMs: 30 * 60_000,
  automationTimeoutMs: 30_000,
  customToolBuilderMaxSteps: 12,
  customToolBuilderMaxActions: 20,
  customToolBuilderMaxOutputTokens: 4_000,
  customToolBuilderTimeoutMs: 0,
} as const;

const UNLIMITED_DEADLINE = new Date("9999-12-31T00:00:00.000Z");
const UNLIMITED_REMAINING_MS = 30 * 24 * 60 * 60 * 1000;
const neverAborts = new AbortController().signal;

function boundedInteger(value: number | null | undefined, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.floor(value as number));
}

export function resolveAgentRuntimeLimits(input: {
  maxToolCalls?: number | null;
  maxOutputTokens?: number | null;
}) {
  const maxToolCalls = boundedInteger(input.maxToolCalls, 20);
  const maxOutputTokens = Math.max(
    1,
    boundedInteger(
      input.maxOutputTokens,
      agentRuntimePolicy.defaultMaxOutputTokens,
    ),
  );
  return {
    maxToolCalls,
    maxOutputTokens,
    maxSteps:
      maxToolCalls === 0 ? 1 : maxToolCalls + agentRuntimePolicy.stepOverhead,
  };
}

export function isUnlimitedRuntimeTimeout(timeoutMs: number) {
  return !Number.isFinite(timeoutMs) || timeoutMs <= 0;
}

export function runtimeDeadlineAt(timeoutMs: number) {
  if (isUnlimitedRuntimeTimeout(timeoutMs)) {
    return new Date(UNLIMITED_DEADLINE);
  }
  return new Date(Date.now() + timeoutMs);
}

/** Remaining ms until deadline. 0 means unlimited (no AbortSignal.timeout).
 *  Negative means the deadline has already passed. */
export function timeoutMsUntil(deadlineAt: Date) {
  const remaining = deadlineAt.getTime() - Date.now();
  if (remaining > UNLIMITED_REMAINING_MS) return 0;
  return remaining > 0 ? remaining : -1;
}

export function createRuntimeDeadline(
  timeoutMs: number,
  parentSignal?: AbortSignal,
) {
  if (timeoutMs < 0) {
    const expired = new AbortController();
    expired.abort();
    return {
      timeoutSignal: expired.signal,
      signal: parentSignal
        ? AbortSignal.any([parentSignal, expired.signal])
        : expired.signal,
    };
  }
  if (isUnlimitedRuntimeTimeout(timeoutMs)) {
    return {
      timeoutSignal: neverAborts,
      signal: parentSignal ?? neverAborts,
    };
  }
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  return {
    timeoutSignal,
    signal: parentSignal
      ? AbortSignal.any([parentSignal, timeoutSignal])
      : timeoutSignal,
  };
}
