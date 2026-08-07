"use client";

import { ShieldCheckIcon,SparklesIcon,WorkflowIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { DeodisLogo } from "@/components/deodis-logo";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { Card,CardContent,CardDescription,CardHeader,CardTitle } from "@/components/ui/card";

export function AuthShell({ title, description, children, footer }: { title: string; description: string; children: ReactNode; footer: ReactNode }) {
  const t = useTranslations("auth");
  const benefits = [
    { icon: SparklesIcon, text: t("benefitChat") },
    { icon: WorkflowIcon, text: t("benefitAgents") },
    { icon: ShieldCheckIcon, text: t("benefitControl") },
  ];

  return (
    <main data-page="auth" className="grid min-h-svh overflow-hidden bg-background lg:grid-cols-[minmax(28rem,1.05fr)_minmax(32rem,0.95fr)]">
      <aside className="relative hidden overflow-hidden bg-[linear-gradient(145deg,#102630_0%,#103943_55%,#0f6172_100%)] p-12 text-white lg:flex lg:flex-col lg:justify-between xl:p-16">
        <div
          className="pointer-events-none absolute inset-0 opacity-55"
          aria-hidden="true"
          style={{
            backgroundImage: "radial-gradient(circle at 18% 12%, rgba(37,173,197,.48), transparent 26%), radial-gradient(circle at 84% 82%, rgba(22,135,201,.38), transparent 32%), linear-gradient(rgba(255,255,255,.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.035) 1px, transparent 1px)",
            backgroundSize: "auto, auto, 40px 40px, 40px 40px",
          }}
        />
        <div className="pointer-events-none absolute -right-32 top-[24%] size-96 rounded-full border border-white/10" aria-hidden="true">
          <div className="absolute inset-12 rounded-full border border-white/10" />
          <div className="absolute inset-28 rounded-full bg-white/5 shadow-[0_0_80px_rgba(37,173,197,0.24)]" />
        </div>
        <div className="relative inline-flex w-fit rounded-2xl border border-white/10 bg-white/8 px-4 py-3 shadow-[0_12px_36px_rgba(0,0,0,0.12)] backdrop-blur-xl">
          <DeodisLogo href="/" priority className="h-7 brightness-0 invert" />
        </div>
        <div className="relative max-w-xl">
          <p className="inline-flex rounded-full border border-white/10 bg-white/8 px-3 py-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-white/70 backdrop-blur-xl">{t("eyebrow")}</p>
          <h1 className="mt-6 text-balance text-4xl font-semibold leading-[1.05] tracking-[-0.055em] xl:text-[3.55rem]">{t("brandTitle")}</h1>
          <p className="mt-5 max-w-lg text-pretty text-base leading-7 text-white/72 xl:text-lg">{t("brandDescription")}</p>
          <ul className="mt-9 grid max-w-lg gap-2.5">
            {benefits.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 rounded-2xl border border-white/8 bg-white/7 px-3 py-2.5 text-sm text-white/88 shadow-[0_10px_30px_rgba(0,0,0,0.08)] backdrop-blur-xl">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/10 text-white">
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs font-medium text-white/60">{t("brandFooter")}</p>
      </aside>

      <section className="relative flex min-h-svh items-start justify-center overflow-hidden px-5 pb-8 pt-[calc(5.75rem+env(safe-area-inset-top))] sm:items-center sm:px-8 sm:py-12 lg:px-12">
        <div className="pointer-events-none absolute -right-40 -top-40 size-[32rem] rounded-full bg-primary/8 blur-3xl" aria-hidden="true" />
        <div className="absolute inset-x-5 top-[calc(1rem+env(safe-area-inset-top))] flex items-center justify-between lg:hidden">
          <DeodisLogo href="/" priority className="h-7" />
          <LocaleSwitcher compact />
        </div>
        <div className="absolute right-6 top-6 hidden lg:block">
          <LocaleSwitcher compact />
        </div>
        <div className="animate-in-up relative w-full max-w-lg">
          <Card className="gap-6 rounded-none border-0 bg-transparent py-0 shadow-none backdrop-blur-none hover:translate-y-0 hover:shadow-none sm:rounded-[1.75rem] sm:border sm:bg-card/92 sm:py-7 sm:shadow-[var(--floating-shadow)] sm:backdrop-blur-xl sm:hover:shadow-[var(--floating-shadow)]">
            <CardHeader className="gap-2.5 px-0 pb-1 sm:px-8 sm:pb-5">
              <CardTitle asChild className="text-balance text-[2.15rem] leading-[0.98] tracking-[-0.05em] sm:text-3xl">
                <h2>{title}</h2>
              </CardTitle>
              <CardDescription asChild className="max-w-md text-pretty text-[0.95rem] leading-6">
                <p>{description}</p>
              </CardDescription>
            </CardHeader>
            <CardContent className="px-0 sm:px-8">{children}</CardContent>
          </Card>
          <div className="mt-6 text-center text-sm text-muted-foreground sm:mt-7">{footer}</div>
        </div>
      </section>
    </main>
  );
}
