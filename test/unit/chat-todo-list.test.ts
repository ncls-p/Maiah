import { describe, expect, it } from "vitest";

import {
  chatTodoListFromUnknown,
  createChatTodoList,
} from "@/modules/chat/todo-list";

describe("chat to-do lists", () => {
  it("creates a bounded progress snapshot that can be restored from history", () => {
    const todoList = createChatTodoList({
      title: "Workflow work",
      items: [
        { id: "plan", label: "Plan", status: "completed" },
        { id: "build", label: "Build", status: "in_progress" },
        { id: "test", label: "Test", status: "pending" },
      ],
    });

    expect(todoList).toMatchObject({
      kind: "chat_todo_list",
      completedCount: 1,
      totalCount: 3,
    });
    expect(
      chatTodoListFromUnknown(JSON.parse(JSON.stringify(todoList))),
    ).toEqual(todoList);
  });

  it("rejects empty or malformed task lists", () => {
    expect(() => createChatTodoList({ title: "Empty", items: [] })).toThrow();
    expect(chatTodoListFromUnknown({ kind: "chat_todo_list" })).toBeNull();
  });
});
