import { parseAgentToolDisplayContext } from "@/modules/agent/tool-progress-payload";
import { projectToolMessagePayload } from "@/modules/tool/safe-payload";

type StreamEvent = Record<string, unknown>;

export type AiHubChatUIMessageMetadata = {
  protocol: "ai-hub-ui";
  conversationId?: string;
  messageId?: string;
  streamGenerationId?: string;
  userMessageId?: string;
  isEphemeral?: boolean;
  expiresAt?: string;
  stopped?: boolean;
  metrics?: import("./message-metrics").ChatMessageMetrics;
};

type Subscriber = {
  enqueue: (event: StreamEvent) => void;
  close: () => void;
};

type StreamRun = {
  generationId: string;
  events: StreamEvent[];
  done: boolean;
  subscribers: Set<Subscriber>;
  abortController?: AbortController;
};

const globalStore = globalThis as typeof globalThis & {
  __aiHubChatStreamRuns?: Map<string, StreamRun>;
};

const runs = globalStore.__aiHubChatStreamRuns ?? new Map<string, StreamRun>();
globalStore.__aiHubChatStreamRuns = runs;

function safeStreamEvent(event: StreamEvent): StreamEvent {
  if (event.type === "tool_call") {
    return {
      ...event,
      input: projectToolMessagePayload(event.input),
      agentContext:
        parseAgentToolDisplayContext(event.agentContext) ?? undefined,
    };
  }
  if (event.type === "tool_result") {
    return {
      ...event,
      output: projectToolMessagePayload(event.output),
      agentContext:
        parseAgentToolDisplayContext(event.agentContext) ?? undefined,
    };
  }
  if (event.type === "tool_approval_required") {
    return { ...event, input: projectToolMessagePayload(event.input) };
  }
  if (event.type === "tool_input_delta") {
    return { ...event, delta: "" };
  }
  if (event.type === "tool_input_snapshot") {
    try {
      return {
        ...event,
        inputText: JSON.stringify(
          projectToolMessagePayload(JSON.parse(String(event.inputText))),
          null,
          2,
        ),
      };
    } catch {
      return { ...event, inputText: "" };
    }
  }
  return event;
}

const LEGACY_GENERATION_ID = "legacy";

/**
 * Replay buffer cap per stream run. Events are projected (no secrets) but
 * unbounded on long agentic runs; keeping only the most recent N bounds
 * in-memory growth per process. Resume catch-up stays lossless in practice:
 * the streaming message's parts are persisted to the DB progressively, and
 * the resume route falls back to a DB reload (202/404/409) whenever the
 * in-memory run is absent (other replica, restart, completed run). The only
 * affected case is a same-process mid-run resume of a run that already
 * produced more than MAX_RUN_EVENTS events: the SSE replay then starts from
 * the retained tail instead of the full history.
 */
export const MAX_RUN_EVENTS = 500;

function appendRunEvent(run: StreamRun, event: StreamEvent) {
  run.events.push(event);
  if (run.events.length > MAX_RUN_EVENTS) {
    run.events.splice(0, run.events.length - MAX_RUN_EVENTS);
  }
}

function retireReplacedRun(run: StreamRun) {
  run.done = true;
  run.abortController?.abort(
    new Error("Chat stream generation was replaced by a newer generation"),
  );
  run.abortController = undefined;
  for (const subscriber of run.subscribers) subscriber.close();
  run.subscribers.clear();
}

function getOrCreateRun(
  messageId: string,
  generationId = LEGACY_GENERATION_ID,
) {
  let run = runs.get(messageId);
  if (!run || run.generationId !== generationId) {
    run = {
      generationId,
      events: [],
      done: false,
      subscribers: new Set(),
    };
    runs.set(messageId, run);
  }
  return run;
}

export function publishChatStreamEvent(
  messageId: string,
  event: StreamEvent,
  generationId = LEGACY_GENERATION_ID,
) {
  const existing = runs.get(messageId);
  if (existing && existing.generationId !== generationId) return;
  const run = getOrCreateRun(messageId, generationId);
  const safeEvent = safeStreamEvent(event);
  appendRunEvent(run, safeEvent);
  for (const subscriber of run.subscribers) {
    subscriber.enqueue(safeEvent);
  }
}

export function registerChatStreamAbortController(
  messageId: string,
  abortController: AbortController,
  generationId = LEGACY_GENERATION_ID,
) {
  let run = runs.get(messageId);
  if (!run || run.done || run.generationId !== generationId) {
    if (run && run.generationId !== generationId) retireReplacedRun(run);
    run = {
      generationId,
      events: [],
      done: false,
      subscribers: new Set(),
    };
    runs.set(messageId, run);
  }
  run.abortController = abortController;
}

export function abortChatStream(
  messageId: string,
  generationId = LEGACY_GENERATION_ID,
) {
  const run = runs.get(messageId);
  if (!run || run.done || run.generationId !== generationId) return false;
  run.abortController?.abort();
  publishChatStreamEvent(
    messageId,
    { type: "done", stopped: true },
    generationId,
  );
  completeChatStream(messageId, generationId);
  return true;
}

export function completeChatStream(
  messageId: string,
  generationId = LEGACY_GENERATION_ID,
) {
  let run = runs.get(messageId);
  if (!run) {
    run = {
      generationId,
      events: [],
      done: true,
      subscribers: new Set(),
    };
    runs.set(messageId, run);
  }
  if (run.generationId !== generationId) return;
  run.done = true;
  run.abortController = undefined;
  for (const subscriber of run.subscribers) {
    subscriber.close();
  }
  run.subscribers.clear();
  setTimeout(
    () => {
      if (runs.get(messageId) === run) runs.delete(messageId);
    },
    5 * 60 * 1000,
  );
}

export function hasActiveChatStream(
  messageId: string,
  generationId = LEGACY_GENERATION_ID,
) {
  const run = runs.get(messageId);
  return Boolean(run && run.generationId === generationId && !run.done);
}

export function subscribeToChatStream(
  messageId: string,
  subscriber: Subscriber,
  options: { replay?: boolean; generationId?: string } = {},
) {
  const generationId = options.generationId ?? LEGACY_GENERATION_ID;
  const existing = runs.get(messageId);
  if (existing && existing.generationId !== generationId) {
    subscriber.close();
    return () => undefined;
  }
  const run = getOrCreateRun(messageId, generationId);
  if (options.replay ?? true) {
    for (const event of run.events) {
      subscriber.enqueue(event);
    }
  }
  if (run.done) {
    subscriber.close();
    return () => undefined;
  }
  run.subscribers.add(subscriber);
  return () => {
    run.subscribers.delete(subscriber);
  };
}

export function createChatStreamResponse(
  messageId: string,
  headers: Record<string, string> = {},
  options: { replay?: boolean; generationId?: string } = {},
) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let unsubscribe: () => void = () => undefined;
      unsubscribe = subscribeToChatStream(
        messageId,
        {
          enqueue(event) {
            try {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
              );
            } catch {
              unsubscribe();
            }
          },
          close() {
            try {
              controller.close();
            } catch {
              // already closed
            }
          },
        },
        options,
      );
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      ...headers,
    },
  });
}

export function stringValue(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

export function outputIsDenied(output: unknown) {
  return (
    typeof output === "object" &&
    output !== null &&
    (output as { denied?: unknown }).denied === true
  );
}

export function metadataFromHeaders(headers: Record<string, string>) {
  return {
    protocol: "ai-hub-ui" as const,
    conversationId: headers["X-Conversation-Id"],
    messageId: headers["X-Message-Id"],
    streamGenerationId: headers["X-Stream-Generation-Id"],
    userMessageId: headers["X-User-Message-Id"],
    isEphemeral: headers["X-Conversation-Ephemeral"] === "true",
    expiresAt: headers["X-Conversation-Expires-At"],
  };
}
