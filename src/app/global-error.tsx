"use client";

import "./globals.css";
import { useEffect, useState } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [isFrench, setIsFrench] = useState(false);

  useEffect(() => {
    queueMicrotask(() => {
      setIsFrench(window.location.pathname.startsWith("/fr"));
    });
  }, []);

  const copy = isFrench
    ? {
        title: "Une erreur est survenue",
        description:
          "Réessayez. Si le problème persiste, transmettez la référence ci-dessous à votre administrateur.",
        reference: "Référence",
        retry: "Réessayer",
      }
    : {
        title: "Something went wrong",
        description:
          "Try again. If the problem continues, share the reference below with your administrator.",
        reference: "Reference",
        retry: "Try again",
      };

  return (
    <html lang={isFrench ? "fr" : "en"} suppressHydrationWarning>
      <body className="min-h-svh bg-background text-foreground antialiased">
        <title>{copy.title} · Maiah</title>
        <main
          data-page="auth"
          className="flex min-h-svh items-center justify-center bg-background p-4"
        >
          <section className="surface-panel animate-in-up w-full max-w-md p-6 text-center">
            <h1 className="text-2xl font-semibold tracking-tight">
              {copy.title}
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {copy.description}
            </p>
            {error.digest ? (
              <p className="mt-4 rounded-lg border border-border/70 bg-background/60 px-3 py-2 font-mono text-xs text-muted-foreground">
                {copy.reference}: {error.digest}
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => reset()}
              className="mt-5 inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-[background-color,border-color,box-shadow,scale] duration-150 ease-out hover:bg-primary/90 active:not-disabled:scale-[0.96] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/35 disabled:pointer-events-none disabled:opacity-50"
            >
              {copy.retry}
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
