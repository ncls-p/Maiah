"use client";

import {
  CheckCircle2Icon,
  CircleIcon,
  ListChecksIcon,
  LoaderCircleIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import type { ChatTodoList } from "@/modules/chat/todo-list";

export function ChatTodoListCard({ todoList }: { todoList: ChatTodoList }) {
  const t = useTranslations("chat.rendering");
  const complete = todoList.completedCount === todoList.totalCount;

  return (
    <section className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
      <div className="flex items-center gap-3 border-b border-border/60 bg-muted/35 px-4 py-3">
        <span
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-lg",
            complete
              ? "bg-emerald-500/12 text-emerald-600"
              : "bg-primary/10 text-primary",
          )}
        >
          <ListChecksIcon className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold">{todoList.title}</h3>
          <p className="text-xs text-muted-foreground">
            {t("todoProgress", {
              completed: todoList.completedCount,
              total: todoList.totalCount,
            })}
          </p>
        </div>
      </div>
      <ul className="divide-y divide-border/50">
        {todoList.items.map((item) => (
          <li key={item.id} className="flex items-start gap-3 px-4 py-3">
            {item.status === "completed" ? (
              <CheckCircle2Icon
                className="mt-0.5 size-4 shrink-0 text-emerald-600"
                aria-hidden="true"
              />
            ) : item.status === "in_progress" ? (
              <LoaderCircleIcon
                className="mt-0.5 size-4 shrink-0 animate-spin text-primary"
                aria-hidden="true"
              />
            ) : (
              <CircleIcon
                className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
            )}
            <span
              className={cn(
                "text-sm leading-5",
                item.status === "completed" &&
                  "text-muted-foreground line-through",
              )}
            >
              {item.label}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
