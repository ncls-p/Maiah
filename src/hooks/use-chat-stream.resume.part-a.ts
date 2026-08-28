import type { ChatMessage } from "@/components/chat/chat-types";

export const DEFAULT_RESUME_RETRY_MS = 2_000;
const MIN_RESUME_RETRY_MS = 500;
const MAX_RESUME_RETRY_MS = 5_000;
const MAX_RESUME_RELOAD_ATTEMPTS = 5;

function abortError() {
  return new DOMException("Aborted", "AbortError");
}

function throwIfAborted(signal: AbortSignal) {
  if (signal.aborted) throw abortError();
}

export function waitForAbortableResumeDelay(
  signal: AbortSignal,
  delayMs: number,
) {
  if (signal.aborted) return Promise.reject(abortError());

  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      signal.removeEventListener("abort", onAbort);
      callback();
    };
    const onAbort = () => finish(() => reject(abortError()));
    const timeoutId = setTimeout(() => finish(resolve), delayMs);

    signal.addEventListener("abort", onAbort, { once: true });
    // Cover an abort racing the listener registration.
    if (signal.aborted) onAbort();
  });
}

export function chatStreamMessageIsActive(
  messages: ChatMessage[],
  messageId: string,
) {
  return messages.some(
    (message) =>
      message.id === messageId &&
      (message.status === "pending" || message.status === "streaming"),
  );
}

type ResumeSource =
  | { kind: "stream"; response: Response }
  | { kind: "terminal"; messages: ChatMessage[] };

export async function waitForChatResumeSource(input: {
  signal: AbortSignal;
  messageId: string;
  requestStream: (signal: AbortSignal) => Promise<Response>;
  reloadMessages: (signal: AbortSignal) => Promise<ChatMessage[] | null>;
  wait?: (signal: AbortSignal, delayMs: number) => Promise<void>;
}): Promise<ResumeSource> {
  const wait = input.wait ?? waitForAbortableResumeDelay;

  async function reloadUntilAvailable() {
    for (let attempt = 1; attempt <= MAX_RESUME_RELOAD_ATTEMPTS; attempt += 1) {
      throwIfAborted(input.signal);
      let messages: ChatMessage[] | null = null;
      try {
        messages = await input.reloadMessages(input.signal);
      } catch (error) {
        if (
          input.signal.aborted ||
          (error instanceof Error && error.name === "AbortError")
        ) {
          throw abortError();
        }
      }
      throwIfAborted(input.signal);
      if (messages !== null) return messages;
      if (attempt < MAX_RESUME_RELOAD_ATTEMPTS) {
        await wait(input.signal, DEFAULT_RESUME_RETRY_MS);
      }
    }

    throw new Error("Failed to reload conversation while resuming chat stream");
  }

  while (true) {
    throwIfAborted(input.signal);
    const response = await input.requestStream(input.signal);
    throwIfAborted(input.signal);

    if (response.status === 202) {
      const pending = (await response.json().catch(() => null)) as {
        retryAfterMs?: number;
      } | null;
      throwIfAborted(input.signal);
      const retryAfterMs = Math.min(
        MAX_RESUME_RETRY_MS,
        Math.max(
          MIN_RESUME_RETRY_MS,
          pending?.retryAfterMs ?? DEFAULT_RESUME_RETRY_MS,
        ),
      );
      await wait(input.signal, retryAfterMs);
      const messages = await reloadUntilAvailable();
      if (!chatStreamMessageIsActive(messages, input.messageId)) {
        return { kind: "terminal", messages };
      }
      continue;
    }

    if (response.status === 404 || response.status === 409) {
      const messages = await reloadUntilAvailable();
      if (!chatStreamMessageIsActive(messages, input.messageId)) {
        return { kind: "terminal", messages };
      }
      await wait(input.signal, DEFAULT_RESUME_RETRY_MS);
      continue;
    }

    return { kind: "stream", response };
  }
}