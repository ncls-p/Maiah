import {
  CheckCircle2Icon,
  ShieldAlertIcon,
  TriangleAlertIcon,
  WrenchIcon,
  XCircleIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

export type ToolVisualState =
  | "pending"
  | "approval"
  | "completed"
  | "warning"
  | "error";

export function ToolStateIcon({
  state,
  className,
}: {
  state: ToolVisualState;
  className?: string;
}) {
  const isActive = state === "pending" || state === "approval";
  const ActiveIcon = state === "approval" ? ShieldAlertIcon : WrenchIcon;
  const SettledIcon =
    state === "error"
      ? XCircleIcon
      : state === "warning"
        ? TriangleAlertIcon
        : CheckCircle2Icon;

  return (
    <span
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-xl bg-background/70 shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--border)_60%,transparent)] transition-[background-color,box-shadow,color] duration-200 ease-out",
        state === "pending" && "text-primary",
        state === "approval" && "text-warning",
        state === "completed" && "text-success",
        state === "warning" && "text-warning",
        state === "error" && "text-destructive",
        className,
      )}
      aria-hidden="true"
    >
      <span className="t-icon-swap" data-state={isActive ? "a" : "b"}>
        <ActiveIcon className="t-icon size-4" data-icon="a" />
        <SettledIcon className="t-icon size-4" data-icon="b" />
      </span>
    </span>
  );
}
