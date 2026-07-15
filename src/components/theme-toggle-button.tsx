"use client";

import type { ComponentProps } from "react";
import { MoonStarIcon, SunIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTheme } from "@teispace/next-themes";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ThemeToggleButton({
  className,
  iconOnly = false,
  menu = false,
  onClick,
  ...buttonProps
}: {
  className?: string;
  iconOnly?: boolean;
  menu?: boolean;
} & ComponentProps<"button">) {
  const t = useTranslations("shell");
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  return (
    <Button
      type="button"
      variant={menu ? "ghost" : "outline"}
      size={iconOnly ? "icon" : "sm"}
      className={cn(
        "text-muted-foreground transition-colors hover:text-foreground",
        iconOnly
          ? "rounded-lg"
          : menu
            ? "h-10 w-full justify-start rounded-lg px-2.5 font-normal"
            : "rounded-full",
        className,
      )}
      aria-label={t("toggleTheme")}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) setTheme(isDark ? "light" : "dark");
      }}
      {...buttonProps}
    >
      <span
        data-icon={iconOnly ? undefined : "inline-start"}
        data-state={isDark ? "b" : "a"}
        className="t-icon-swap"
        aria-hidden="true"
      >
        <MoonStarIcon data-icon="a" className="t-icon size-4" />
        <SunIcon data-icon="b" className="t-icon size-4" />
      </span>
      {iconOnly ? <span className="sr-only">{t("theme")}</span> : t("theme")}
    </Button>
  );
}
