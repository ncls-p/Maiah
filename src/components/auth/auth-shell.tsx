"use client";

import type { ReactNode } from "react";
import { ShieldCheckIcon, SparklesIcon, WorkflowIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { DeodisLogo } from "@/components/deodis-logo";
import { LocaleSwitcher } from "@/components/locale-switcher";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function AuthShell({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  const t = useTranslations("auth");
  const benefits = [
    { icon: SparklesIcon, text: t("benefitChat") },
    { icon: WorkflowIcon, text: t("benefitAgents") },
    { icon: ShieldCheckIcon, text: t("benefitControl") },
  ];

  return (
    <main
      data-page="auth"
      className="grid min-h-svh overflow-hidden bg-background lg:grid-cols-[minmax(22rem,0.85fr)_minmax(32rem,1.15fr)]"
    >
      <aside className="relative hidden overflow-hidden border-r bg-[linear-gradient(145deg,var(--brand-noir),#102f38)] p-10 text-white lg:flex lg:flex-col lg:justify-between xl:p-14">
        <div
          className="pointer-events-none absolute inset-0 opacity-30"
          aria-hidden="true"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 15%, rgba(37,173,197,.55), transparent 28%), radial-gradient(circle at 85% 80%, rgba(37,173,197,.25), transparent 32%)",
          }}
        />
        <div className="relative">
          <DeodisLogo href="/" priority className="h-8 brightness-0 invert" />
        </div>
        <div className="relative max-w-lg">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/60">
            {t("eyebrow")}
          </p>
          <h1 className="mt-4 text-balance text-4xl font-semibold leading-tight tracking-[-0.045em] xl:text-5xl">
            {t("brandTitle")}
          </h1>
          <p className="mt-4 max-w-md text-pretty text-base leading-relaxed text-white/70">
            {t("brandDescription")}
          </p>
          <ul className="mt-8 grid gap-3">
            {benefits.map(({ icon: Icon, text }) => (
              <li
                key={text}
                className="flex items-center gap-3 text-sm text-white/85"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/10">
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-white/45">{t("brandFooter")}</p>
      </aside>

      <section className="relative flex min-h-svh items-center justify-center px-4 py-10 sm:px-8">
        <div className="absolute right-4 top-4 sm:right-6 sm:top-6">
          <LocaleSwitcher compact />
        </div>
        <div className="animate-in-fade w-full max-w-md">
          <div className="mb-8 flex justify-center lg:hidden">
            <DeodisLogo href="/" priority className="h-8" />
          </div>
          <Card className="border-border/70 shadow-[0_22px_70px_rgba(15,37,45,0.10)]">
            <CardHeader className="gap-2 pb-5">
              <CardTitle
                asChild
                className="text-balance text-2xl tracking-[-0.035em]"
              >
                <h2>{title}</h2>
              </CardTitle>
              <CardDescription asChild className="text-pretty leading-relaxed">
                <p>{description}</p>
              </CardDescription>
            </CardHeader>
            <CardContent>{children}</CardContent>
          </Card>
          <div className="mt-6 text-center text-sm text-muted-foreground">
            {footer}
          </div>
        </div>
      </section>
    </main>
  );
}
