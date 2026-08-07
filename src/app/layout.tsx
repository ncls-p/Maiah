import type { Metadata, Viewport } from "next";
import { Geist_Mono, Instrument_Sans, Newsreader } from "next/font/google";
import { cookies } from "next/headers";

import { ThemeProvider } from "@/components/theme-provider";
import { PwaRegistration } from "@/components/pwa-registration";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { defaultLocale, locales } from "@/i18n/routing";
import { cn } from "@/lib/utils";
import "./globals.css";

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

const fontHeading = Newsreader({
  subsets: ["latin"],
  variable: "--font-editorial",
  display: "swap",
});

export const metadata: Metadata = {
  applicationName: "Maiah",
  title: {
    default: "Maiah",
    template: "%s · Maiah",
  },
  description:
    "Build, configure, and run AI agents with multi-provider support and team collaboration.",
  icons: {
    icon: [
      { url: "/maiah-mark.svg", type: "image/svg+xml" },
      { url: "/maiah-icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    shortcut: "/maiah-icon-192.png",
    apple: [
      { url: "/maiah-icon-192.png", sizes: "192x192", type: "image/png" },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Maiah",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  interactiveWidget: "resizes-content",
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4fafc" },
    { media: "(prefers-color-scheme: dark)", color: "#101a22" },
  ],
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
        fontHeading.variable,
      )}
    >
      <body className="min-h-svh" suppressHydrationWarning>
        <ThemeProvider>
          <PwaRegistration />
          <TooltipProvider>
            {children}
            <Toaster />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
