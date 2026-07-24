"use client";

import {
  CheckIcon,
  CircleIcon,
  LoaderCircleIcon,
  ListTodoIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import type { ChatTodoList } from "@/modules/chat/todo-list";

export function ChatTodoListCard({ todoList }: { todoList: ChatTodoList }) {
  const t = useTranslations("chat.rendering");
  const complete = todoList.completedCount === todoList.totalCount;
  const progress =
    todoList.totalCount === 0
      ? 0
      : todoList.completedCount / todoList.totalCount;

  return (
    <section
      className="overflow-hidden rounded-2xl bg-card text-card-foreground shadow-[var(--surface-shadow)]"
      aria-label={todoList.title}
    >
      <div className="flex items-start gap-3 px-4 pb-3 pt-3.5">
        <span
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-xl shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--border)_55%,transparent)] transition-[background-color,color,box-shadow] duration-200 ease-out",
            complete
              ? "bg-foreground text-background"
              : "bg-muted/45 text-foreground",
          )}
        >
          {complete ? (
            <CheckIcon
              className="size-4"
              strokeWidth={2.5}
              aria-hidden="true"
            />
          ) : (
            <ListTodoIcon className="size-4" aria-hidden="true" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-pretty text-sm font-semibold leading-5">
            {todoList.title}
          </h3>
          <p className="mt-0.5 text-xs leading-4 text-muted-foreground">
            {t("todoProgress", {
              completed: todoList.completedCount,
              total: todoList.totalCount,
            })}
          </p>
        </div>
        <span
          className={cn(
            "mt-0.5 shrink-0 rounded-full px-2 py-1 text-[11px] font-medium leading-none tabular-nums shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--border)_60%,transparent)]",
            complete
              ? "bg-foreground text-background"
              : "bg-muted/40 text-muted-foreground",
          )}
          aria-hidden="true"
        >
          {todoList.completedCount}/{todoList.totalCount}
        </span>
      </div>

      <div
        className="mx-4 h-1 overflow-hidden rounded-full bg-muted/65"
        role="progressbar"
        aria-label={t("todoProgressLabel", { title: todoList.title })}
        aria-valuemin={0}
        aria-valuemax={todoList.totalCount}
        aria-valuenow={todoList.completedCount}
      >
        <span
          className={cn(
            "block h-full origin-left rounded-full transition-transform duration-300 ease-out motion-reduce:transition-none",
            complete ? "bg-foreground" : "bg-primary",
          )}
          style={{ transform: `scaleX(${progress})` }}
        />
      </div>

      <ul className="px-2 pb-2 pt-2">
        {todoList.items.map((item, index) => {
          const active = item.status === "in_progress";
          const completed = item.status === "completed";

          return (
            <li
              key={item.id}
              className={cn(
                "relative flex min-h-10 items-start gap-3 rounded-xl px-2 py-2 transition-[background-color,box-shadow] duration-200 ease-out",
                active &&
                  "bg-primary/[0.055] shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--primary)_16%,transparent)]",
              )}
              aria-current={active ? "step" : undefined}
            >
              <span className="relative z-0 mt-0.5 flex size-5 shrink-0 items-center justify-center">
                {index < todoList.items.length - 1 ? (
                  <span
                    className={cn(
                      "absolute left-1/2 top-4 -bottom-3 -z-10 w-px -translate-x-1/2",
                      completed ? "bg-foreground/20" : "bg-border/70",
                    )}
                    aria-hidden="true"
                  />
                ) : null}
                {completed ? (
                  <span className="flex size-4 items-center justify-center rounded-full bg-foreground text-background shadow-[0_0_0_2px_var(--card)]">
                    <CheckIcon
                      className="size-2.5"
                      strokeWidth={3}
                      aria-hidden="true"
                    />
                  </span>
                ) : active ? (
                  <span className="flex size-5 items-center justify-center rounded-full bg-primary/10 shadow-[0_0_0_2px_var(--card)]">
                    <LoaderCircleIcon
                      className="size-3.5 animate-spin text-primary motion-reduce:animate-none"
                      aria-hidden="true"
                    />
                  </span>
                ) : (
                  <CircleIcon
                    className="size-4 fill-card text-border"
                    aria-hidden="true"
                  />
                )}
                <span className="sr-only">
                  {completed
                    ? t("todoCompleted")
                    : active
                      ? t("todoInProgress")
                      : t("todoPending")}
                </span>
              </span>
              <span
                className={cn(
                  "min-w-0 flex-1 text-pretty text-sm leading-5",
                  completed && "text-muted-foreground",
                  active && "font-medium text-foreground",
                  !completed && !active && "text-foreground/75",
                )}
              >
                {item.label}
              </span>
              {active ? (
                <span
                  className="mt-0.5 shrink-0 rounded-full bg-primary/10 px-2 py-1 text-[10px] font-semibold leading-none text-primary"
                  aria-hidden="true"
                >
                  {t("todoInProgress")}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
