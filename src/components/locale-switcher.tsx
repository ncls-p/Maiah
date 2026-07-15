"use client";

import type { ComponentProps } from "react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { locales, type Locale } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LanguagesIcon } from "lucide-react";

export function LocaleSwitcher({
  className,
  compact = false,
  menu = false,
  onClick,
  ...buttonProps
}: {
  className?: string;
  compact?: boolean;
  menu?: boolean;
} & ComponentProps<"button">) {
  const t = useTranslations("common");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const pathname = usePathname();

  function switchLocale(code: Locale) {
    if (code !== locale) {
      router.replace(pathname, { locale: code });
    }
  }

  if (menu) {
    const nextLocale = locales.find((code) => code !== locale) ?? locale;
    const currentLanguage = locale === "fr" ? t("french") : t("english");

    return (
      <Button
        type="button"
        variant="ghost"
        className={cn(
          "h-10 w-full justify-start gap-2 rounded-lg px-2.5 font-normal",
          className,
        )}
        onClick={(event) => {
          onClick?.(event);
          if (!event.defaultPrevented) switchLocale(nextLocale);
        }}
        {...buttonProps}
      >
        <LanguagesIcon data-icon="inline-start" aria-hidden="true" />
        <span className="flex-1 text-left">{t("language")}</span>
        <span className="text-xs text-muted-foreground">{currentLanguage}</span>
      </Button>
    );
  }

  if (compact) {
    const nextLocale = locales.find((code) => code !== locale) ?? locale;
    return (
      <Button
        type="button"
        variant="outline"
        size="icon"
        className={cn(
          "size-8 shrink-0 rounded-lg font-semibold uppercase",
          className,
        )}
        aria-label={t("language")}
        title={locale === "fr" ? t("french") : t("english")}
        onClick={(event) => {
          onClick?.(event);
          if (!event.defaultPrevented) switchLocale(nextLocale);
        }}
        {...buttonProps}
      >
        {locale}
      </Button>
    );
  }

  return (
    <div
      role="group"
      aria-label={t("language")}
      className={cn(
        "relative z-30 flex h-8 w-full min-w-0 overflow-hidden rounded-lg border border-input bg-background shadow-[var(--surface-shadow)]",
        className,
      )}
    >
      {locales.map((code) => (
        <button
          key={code}
          type="button"
          aria-pressed={locale === code}
          aria-label={code === "fr" ? t("french") : t("english")}
          title={code === "fr" ? t("french") : t("english")}
          className={cn(
            "flex flex-1 items-center justify-center text-xs font-semibold uppercase transition-[background-color,color,scale] duration-150 ease-out outline-none active:scale-[0.96] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
            locale === code
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
          )}
          onClick={() => switchLocale(code)}
        >
          {code}
        </button>
      ))}
    </div>
  );
}
