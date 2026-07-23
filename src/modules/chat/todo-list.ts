import { z } from "zod";

export const chatTodoItemSchema = z.object({
  id: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(300),
  status: z.enum(["pending", "in_progress", "completed"]),
});

export const chatTodoListInputSchema = z.object({
  title: z.string().trim().min(1).max(120).default("To-do list"),
  items: z.array(chatTodoItemSchema).min(1).max(30),
});

export type ChatTodoList = {
  kind: "chat_todo_list";
  title: string;
  items: Array<z.infer<typeof chatTodoItemSchema>>;
  completedCount: number;
  totalCount: number;
};

export function createChatTodoList(input: unknown): ChatTodoList {
  const parsed = chatTodoListInputSchema.parse(input);
  return {
    kind: "chat_todo_list",
    title: parsed.title,
    items: parsed.items,
    completedCount: parsed.items.filter((item) => item.status === "completed")
      .length,
    totalCount: parsed.items.length,
  };
}

export function chatTodoListFromUnknown(value: unknown): ChatTodoList | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  if (record.kind !== "chat_todo_list") return null;
  const parsed = z
    .object({
      kind: z.literal("chat_todo_list"),
      title: z.string(),
      items: z.array(chatTodoItemSchema),
      completedCount: z.number().int().nonnegative(),
      totalCount: z.number().int().nonnegative(),
    })
    .safeParse(record);
  return parsed.success ? parsed.data : null;
}
