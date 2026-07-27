"use client";

import {
  CheckIcon,
  ChevronDownIcon,
  CircleIcon,
  LoaderCircleIcon,
  ListTodoIcon,
} from "lucide-react";
import { useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type { ChatTodoList } from "@/modules/chat/todo-list";

export function ChatTodoListDock({ todoList }: { todoList: ChatTodoList }) {
  const t = useTranslations("chat.rendering");
  const [open, setOpen] = useState(false);
  const complete = todoList.completedCount === todoList.totalCount;
  const progress =
    todoList.totalCount === 0
      ? 0
      : todoList.completedCount / todoList.totalCount;
  const currentItem =
    todoList.items.find((item) => item.status === "in_progress") ??
    todoList.items.find((item) => item.status === "pending") ??
    todoList.items.at(-1);

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="overflow-hidden rounded-[1.15rem] bg-card/96 text-card-foreground shadow-[0_0_0_1px_color-mix(in_oklch,var(--border)_72%,transparent),0_18px_42px_-28px_color-mix(in_oklch,var(--foreground)_38%,transparent)] backdrop-blur-xl"
      asChild
    >
      <section aria-label={todoList.title}>
        <div className="flex min-h-14 items-center gap-2.5 px-2.5 py-2">
          <span
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-[0.8rem] shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--border)_55%,transparent)] transition-[background-color,color,box-shadow] duration-200 ease-out",
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
            <div className="flex min-w-0 items-center gap-2">
              <h3 className="truncate text-sm font-semibold leading-5">
                {todoList.title}
              </h3>
              <span
                className={cn(
                  "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none tabular-nums",
                  complete
                    ? "bg-foreground text-background"
                    : "bg-primary/10 text-primary",
                )}
                aria-hidden="true"
              >
                {todoList.completedCount}/{todoList.totalCount}
              </span>
            </div>
            <p className="truncate text-xs leading-4 text-muted-foreground">
              {currentItem?.label ??
                t("todoProgress", {
                  completed: todoList.completedCount,
                  total: todoList.totalCount,
                })}
            </p>
          </div>
          <CollapsibleTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-10 shrink-0 rounded-xl text-muted-foreground transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.96]"
              aria-label={open ? t("todoHideDetails") : t("todoShowDetails")}
            >
              <ChevronDownIcon
                className={cn(
                  "size-4 transition-transform duration-200 ease-out motion-reduce:transition-none",
                  open && "rotate-180",
                )}
                aria-hidden="true"
              />
            </Button>
          </CollapsibleTrigger>
        </div>

        <div
          className="mx-3 h-0.5 overflow-hidden rounded-full bg-muted/65"
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

        <CollapsibleContent className="data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down overflow-hidden motion-reduce:animate-none">
          <p className="px-4 pt-2 text-xs text-muted-foreground">
            {t("todoProgress", {
              completed: todoList.completedCount,
              total: todoList.totalCount,
            })}
          </p>
          <ul className="max-h-[min(20rem,40vh)] overflow-y-auto px-2 pb-2 pt-2">
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
                  <span
                    className="relative z-0 mt-0.5 flex size-5 shrink-0 items-center justify-center"
                    role="img"
                    aria-label={
                      completed
                        ? t("todoCompleted")
                        : active
                          ? t("todoInProgress")
                          : t("todoPending")
                    }
                  >
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
        </CollapsibleContent>
      </section>
    </Collapsible>
  );
}
