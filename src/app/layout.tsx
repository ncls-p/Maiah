import type { Metadata } from "next";
import { Geist_Mono, Instrument_Sans } from "next/font/google";
import { cookies } from "next/headers";

import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { defaultLocale, locales } from "@/i18n/routing";

const fontBody = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Maiah",
    template: "%s · Maiah",
  },
  description:
    "Build, configure, and run AI agents with multi-provider support and team collaboration.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const localeCookie = (await cookies()).get("NEXT_LOCALE")?.value;
  const documentLanguage =
    locales.find((locale) => locale === localeCookie) ?? defaultLocale;

  return (
    <html
      lang={documentLanguage}
      data-scroll-behavior="smooth"
      suppressHydrationWarning
      className={cn(
        "min-h-full bg-background text-foreground antialiased",
        fontMono.variable,
        fontBody.variable,
      )}
    >
      <body className="min-h-svh" suppressHydrationWarning>
        <ThemeProvider>
          <TooltipProvider>
            {children}
            <Toaster />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
