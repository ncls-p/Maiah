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
const MAX_NATIVE_TIMEOUT_MS = 2_147_483_647;
const neverAborts = new AbortController().signal;
const noop = () => undefined;

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
  if (deadlineAt.getTime() === UNLIMITED_DEADLINE.getTime()) return 0;
  const remaining = deadlineAt.getTime() - Date.now();
  return remaining > 0 ? remaining : -1;
}

function createLongTimeout(timeoutMs: number) {
  const controller = new AbortController();
  const expiresAt = Date.now() + timeoutMs;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const schedule = () => {
    const remaining = expiresAt - Date.now();
    if (remaining <= 0) {
      controller.abort(
        new DOMException(
          "The operation was aborted due to timeout",
          "TimeoutError",
        ),
      );
      return;
    }
    timer = setTimeout(schedule, Math.min(remaining, MAX_NATIVE_TIMEOUT_MS));
    timer.unref?.();
  };
  schedule();

  return {
    signal: controller.signal,
    dispose: () => {
      if (timer) clearTimeout(timer);
    },
  };
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
      dispose: noop,
    };
  }
  if (isUnlimitedRuntimeTimeout(timeoutMs)) {
    return {
      timeoutSignal: neverAborts,
      signal: parentSignal ?? neverAborts,
      dispose: noop,
    };
  }
  const timeout =
    timeoutMs <= MAX_NATIVE_TIMEOUT_MS
      ? { signal: AbortSignal.timeout(timeoutMs), dispose: noop }
      : createLongTimeout(timeoutMs);
  const timeoutSignal = timeout.signal;
  return {
    timeoutSignal,
    signal: parentSignal
      ? AbortSignal.any([parentSignal, timeoutSignal])
      : timeoutSignal,
    dispose: timeout.dispose,
  };
}
