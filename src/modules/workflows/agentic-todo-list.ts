import { and, eq } from "drizzle-orm";

import {
  chatTodoListFromUnknown,
  createChatTodoList,
  type ChatTodoList,
} from "@/modules/chat/todo-list";
import { db } from "@/server/infrastructure/db";
import { workflowAgentTodoLists } from "@/server/infrastructure/db/schema";

export async function getWorkflowAgentTodoList(input: {
  workflowId: string;
  workspaceId: string;
  userId: string;
}): Promise<ChatTodoList | null> {
  const [row] = await db
    .select({ todoListJson: workflowAgentTodoLists.todoListJson })
    .from(workflowAgentTodoLists)
    .where(
      and(
        eq(workflowAgentTodoLists.workflowId, input.workflowId),
        eq(workflowAgentTodoLists.workspaceId, input.workspaceId),
        eq(workflowAgentTodoLists.userId, input.userId),
      ),
    )
    .limit(1);
  return row ? chatTodoListFromUnknown(row.todoListJson) : null;
}

export async function updateWorkflowAgentTodoList(input: {
  workflowId: string;
  workspaceId: string;
  userId: string;
  todoList: unknown;
}) {
  const todoList = createChatTodoList(input.todoList);
  await db
    .insert(workflowAgentTodoLists)
    .values({
      workflowId: input.workflowId,
      workspaceId: input.workspaceId,
      userId: input.userId,
      todoListJson: todoList,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [
        workflowAgentTodoLists.workflowId,
        workflowAgentTodoLists.userId,
      ],
      set: {
        workspaceId: input.workspaceId,
        todoListJson: todoList,
        updatedAt: new Date(),
      },
    });
  return todoList;
}
