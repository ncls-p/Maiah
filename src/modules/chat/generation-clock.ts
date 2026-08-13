import type { ChatGenerationTimings } from "@/modules/chat/message-metrics";

const DECODE_TOKEN_TYPES = new Set([
  "text-delta",
  "reasoning-delta",
  "tool-input-delta",
]);

const TOOL_START_TYPES = new Set(["tool-input-end", "tool-call"]);
const TOOL_END_TYPES = new Set(["tool-result", "tool-error"]);

function definedMs(value: number) {
  return value > 0 ? value : undefined;
}

export function createGenerationClock(
  startedAt: number,
  now: () => number = Date.now,
) {
  let firstTokenAt: number | undefined;
  let decodeStartedAt: number | undefined;
  let lastTokenAt: number | undefined;
  let generationMs = 0;

  const openTools = new Set<string>();
  const anonymousToolStarts: string[] = [];
  let anonymousToolSeq = 0;
  let toolWindowStartedAt: number | undefined;
  let toolMs = 0;

  let thinkingDepth = 0;
  let thinkingStartedAt: number | undefined;
  let intervalThinkingStartedAt: number | undefined;
  let thinkingMs = 0;

  function markToken() {
    const at = now();
    firstTokenAt ??= at;
    decodeStartedAt ??= at;
    lastTokenAt = at;
  }

  function pauseDecode() {
    if (decodeStartedAt == null || lastTokenAt == null) return;
    generationMs += Math.max(0, lastTokenAt - decodeStartedAt);
    decodeStartedAt = undefined;
  }

  function endIntervalThinking() {
    if (intervalThinkingStartedAt == null) return;
    thinkingMs += Math.max(0, now() - intervalThinkingStartedAt);
    intervalThinkingStartedAt = undefined;
  }

  function startThinking() {
    endIntervalThinking();
    if (thinkingDepth === 0) thinkingStartedAt = now();
    thinkingDepth += 1;
  }

  function endThinking() {
    if (thinkingDepth === 0) return;
    thinkingDepth -= 1;
    if (thinkingDepth > 0 || thinkingStartedAt == null) return;
    thinkingMs += Math.max(0, now() - thinkingStartedAt);
    thinkingStartedAt = undefined;
  }

  function resolveToolId(toolCallId: string | undefined, starting: boolean) {
    if (toolCallId) return toolCallId;
    if (starting) {
      const key = `anon:${anonymousToolSeq}`;
      anonymousToolSeq += 1;
      anonymousToolStarts.push(key);
      return key;
    }
    return anonymousToolStarts.pop() ?? `anon:end:${anonymousToolSeq}`;
  }

  function startTool(toolCallId: string) {
    if (openTools.has(toolCallId)) return;
    endIntervalThinking();
    if (openTools.size === 0) toolWindowStartedAt = now();
    openTools.add(toolCallId);
  }

  function endTool(toolCallId: string) {
    if (!openTools.delete(toolCallId)) return;
    if (openTools.size > 0 || toolWindowStartedAt == null) return;
    toolMs += Math.max(0, now() - toolWindowStartedAt);
    toolWindowStartedAt = undefined;
  }

  function startIntervalThinking() {
    if (
      thinkingDepth > 0 ||
      openTools.size > 0 ||
      intervalThinkingStartedAt != null
    ) {
      return;
    }
    intervalThinkingStartedAt = now();
  }

  function observe(partType: string, toolCallId?: string) {
    if (partType === "reasoning-start") {
      startThinking();
      return;
    }
    if (partType === "reasoning-delta") {
      endIntervalThinking();
      markToken();
      if (thinkingDepth === 0) startThinking();
      return;
    }
    if (partType === "reasoning-end") {
      pauseDecode();
      endThinking();
      startIntervalThinking();
      return;
    }
    if (DECODE_TOKEN_TYPES.has(partType)) {
      endIntervalThinking();
      markToken();
      return;
    }
    if (TOOL_START_TYPES.has(partType)) {
      pauseDecode();
      startTool(resolveToolId(toolCallId, true));
      return;
    }
    if (TOOL_END_TYPES.has(partType)) {
      pauseDecode();
      endTool(resolveToolId(toolCallId, false));
      startIntervalThinking();
      return;
    }
    if (partType === "finish-step") {
      pauseDecode();
      startIntervalThinking();
    }
  }

  function snapshot(): ChatGenerationTimings {
    pauseDecode();
    if (thinkingStartedAt != null) {
      thinkingMs += Math.max(0, now() - thinkingStartedAt);
      thinkingStartedAt = undefined;
      thinkingDepth = 0;
    }
    if (openTools.size > 0 && toolWindowStartedAt != null) {
      toolMs += Math.max(0, now() - toolWindowStartedAt);
      toolWindowStartedAt = undefined;
      openTools.clear();
    }
    return {
      durationMs: Math.max(0, now() - startedAt),
      timeToFirstTokenMs:
        firstTokenAt == null
          ? undefined
          : Math.max(0, firstTokenAt - startedAt),
      generationMs: definedMs(generationMs),
      toolMs: definedMs(toolMs),
      thinkingMs: definedMs(thinkingMs),
    };
  }

  return { observe, snapshot };
}
