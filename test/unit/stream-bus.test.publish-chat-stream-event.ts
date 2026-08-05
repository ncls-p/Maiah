import { afterEach,beforeEach,vi } from "vitest";

export let publishChatStreamEvent: (
  messageId: string,
  event: Record<string, unknown>,
) => void;
export let completeChatStream: (messageId: string) => void;
export let hasActiveChatStream: (messageId: string) => boolean;
export let subscribeToChatStream: (
  messageId: string,
  subscriber: {
    enqueue: (e: Record<string, unknown>) => void;
    close: () => void;
  },
  options?: { replay?: boolean },
) => () => void;
export let abortChatStream: (messageId: string) => boolean;
export let registerChatStreamAbortController: (
  messageId: string,
  controller: AbortController,
) => void;
export let createChatUIMessageStreamResponse: (
  messageId: string,
  headers?: Record<string, string>,
) => Response;

beforeEach(async () => {
  vi.resetModules();
  ({
    publishChatStreamEvent,
    completeChatStream,
    hasActiveChatStream,
    subscribeToChatStream,
    abortChatStream,
    registerChatStreamAbortController,
    createChatUIMessageStreamResponse,
  } = await import("@/modules/chat/stream-bus"));
});

afterEach(() => {
  vi.resetModules();
});
