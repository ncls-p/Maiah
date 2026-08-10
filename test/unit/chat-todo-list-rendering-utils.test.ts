import { describe, expect, it } from "vitest";

import {
  chatTodoListFromToolPart,
  latestChatTodoListFromMessages,
} from "@/components/chat/chat-message-rendering-utils";
import type {
  ChatMessage,
  ChatMessagePart,
} from "@/components/chat/chat-types";

function todoPart(
  completedCount: number,
  activeStatus: "pending" | "in_progress" | "completed",
): ChatMessagePart {
  return {
    type: "tool-call",
    content: JSON.stringify({
      toolCallId: `todo-${completedCount}`,
      toolName: "update_todo_list",
      output: {
        kind: "chat_todo_list",
        title: "Investigation",
        items: [
          {
            id: "research",
            label: "Research the issue",
            status: completedCount > 0 ? "completed" : "in_progress",
          },
          {
            id: "verify",
            label: "Verify the fix",
            status: activeStatus,
          },
        ],
        completedCount,
        totalCount: 2,
      },
    }),
  };
}

describe("chat todo list rendering state", () => {
  it("extracts a todo list from a completed tool part", () => {
    expect(chatTodoListFromToolPart(todoPart(1, "in_progress"))).toMatchObject({
      title: "Investigation",
      completedCount: 1,
      totalCount: 2,
    });
  });

  it("keeps only the latest todo snapshot across the conversation", () => {
    const messages: ChatMessage[] = [
      {
        id: "assistant-1",
        role: "assistant",
        parts: [todoPart(0, "pending")],
      },
      {
        id: "assistant-2",
        role: "assistant",
        parts: [
          { type: "text", content: "I am checking the result." },
          todoPart(2, "completed"),
        ],
      },
    ];

    expect(latestChatTodoListFromMessages(messages)).toMatchObject({
      title: "Investigation",
      completedCount: 2,
      totalCount: 2,
    });
  });
});
