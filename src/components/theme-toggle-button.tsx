"use client";

import { MoonStarIcon, SunIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTheme } from "@teispace/next-themes";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ThemeToggleButton({
  className,
  iconOnly = false,
}: {
  className?: string;
  iconOnly?: boolean;
}) {
  const t = useTranslations("shell");
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  return (
    <Button
      type="button"
      variant="outline"
      size={iconOnly ? "icon" : "sm"}
      className={cn(
        "text-muted-foreground transition-colors hover:text-foreground",
        iconOnly ? "rounded-lg" : "rounded-full",
        className,
      )}
      aria-label={t("toggleTheme")}
      onClick={() => setTheme(isDark ? "light" : "dark")}
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
