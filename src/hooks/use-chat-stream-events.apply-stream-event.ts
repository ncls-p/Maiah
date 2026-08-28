"use client";
import type { ChatStreamEvent } from "@/components/chat/chat-types";
import {
  applyStreamEventMessage,
  isToolStreamEvent,
  type ApplyStreamEventHandlers,
} from "./use-chat-stream-events.apply-stream-event.part-a";
import { applyStreamEventTool } from "./use-chat-stream-events.apply-stream-event.part-b";

export function applyStreamEvent(
  parsed: ChatStreamEvent,
  handlers: ApplyStreamEventHandlers,
) {
  if (parsed.type === "error") {
    throw new Error(parsed.error);
  }
  if (isToolStreamEvent(parsed)) {
    applyStreamEventTool(parsed, handlers);
    return;
  }
  applyStreamEventMessage(parsed, handlers);
}