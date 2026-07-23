import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const chain = {
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
    values: vi.fn(),
    onConflictDoUpdate: vi.fn(),
  };
  for (const method of ["from", "where", "values"] as const) {
    chain[method].mockReturnValue(chain);
  }
  return {
    chain,
    select: vi.fn(() => chain),
    insert: vi.fn(() => chain),
  };
});

vi.mock("@/server/infrastructure/db", () => ({
  db: {
    select: mocks.select,
    insert: mocks.insert,
  },
}));

import {
  getWorkflowAgentTodoList,
  updateWorkflowAgentTodoList,
} from "@/modules/workflows/agentic-todo-list";

const scope = {
  workflowId: "11111111-1111-4111-8111-111111111111",
  workspaceId: "22222222-2222-4222-8222-222222222222",
  userId: "33333333-3333-4333-8333-333333333333",
};

const todoList = {
  kind: "chat_todo_list" as const,
  title: "Build workflow",
  items: [
    { id: "build", label: "Build", status: "completed" as const },
    { id: "test", label: "Test", status: "in_progress" as const },
  ],
  completedCount: 1,
  totalCount: 2,
};

beforeEach(() => {
  vi.clearAllMocks();
  for (const method of ["from", "where", "values"] as const) {
    mocks.chain[method].mockReturnValue(mocks.chain);
  }
  mocks.chain.limit.mockResolvedValue([]);
  mocks.chain.onConflictDoUpdate.mockResolvedValue(undefined);
});

describe("workflow agent to-do list", () => {
  it("loads the latest checklist in workflow and user scope", async () => {
    mocks.chain.limit.mockResolvedValueOnce([{ todoListJson: todoList }]);
    await expect(getWorkflowAgentTodoList(scope)).resolves.toEqual(todoList);

    mocks.chain.limit.mockResolvedValueOnce([]);
    await expect(getWorkflowAgentTodoList(scope)).resolves.toBeNull();
  });

  it("upserts a complete checklist snapshot", async () => {
    await expect(
      updateWorkflowAgentTodoList({
        ...scope,
        todoList: {
          title: todoList.title,
          items: todoList.items,
        },
      }),
    ).resolves.toEqual(todoList);

    expect(mocks.chain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        ...scope,
        todoListJson: todoList,
      }),
    );
    expect(mocks.chain.onConflictDoUpdate).toHaveBeenCalled();
  });
});
