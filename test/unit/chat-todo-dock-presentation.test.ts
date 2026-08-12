import { beforeEach, describe, expect, it } from "vitest";

import {
  chatTodoPlanKey,
  readTodoDockPresentation,
  resetTodoDockPresentations,
  writeTodoDockPresentation,
} from "@/components/chat/chat-todo-list-presentation";
import { createChatTodoList } from "@/modules/chat/todo-list";

describe("chat todo dock presentation", () => {
  beforeEach(() => {
    resetTodoDockPresentations();
  });

  it("defaults to expanded and remembers collapsed or hidden across progress updates", () => {
    const initial = createChatTodoList({
      title: "Recherche Qwen",
      items: [
        { id: "a", label: "Step A", status: "in_progress" },
        { id: "b", label: "Step B", status: "pending" },
      ],
    });
    const progressed = createChatTodoList({
      title: "Recherche Qwen",
      items: [
        { id: "a", label: "Step A", status: "completed" },
        { id: "b", label: "Step B", status: "in_progress" },
      ],
    });

    const key = chatTodoPlanKey(initial);
    expect(chatTodoPlanKey(progressed)).toBe(key);
    expect(readTodoDockPresentation(key)).toBe("expanded");

    writeTodoDockPresentation(key, "collapsed");
    expect(readTodoDockPresentation(chatTodoPlanKey(progressed))).toBe(
      "collapsed",
    );

    writeTodoDockPresentation(key, "hidden");
    expect(readTodoDockPresentation(chatTodoPlanKey(progressed))).toBe(
      "hidden",
    );
  });

  it("treats a new plan identity as a separate memory that still defaults open", () => {
    const first = createChatTodoList({
      title: "Plan A",
      items: [{ id: "one", label: "One", status: "pending" }],
    });
    writeTodoDockPresentation(chatTodoPlanKey(first), "hidden");

    const second = createChatTodoList({
      title: "Plan B",
      items: [{ id: "one", label: "One", status: "pending" }],
    });
    expect(readTodoDockPresentation(chatTodoPlanKey(second))).toBe("expanded");
  });
});
