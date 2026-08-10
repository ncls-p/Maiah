import { cookies } from "next/headers";
import Image from "next/image";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { defaultLocale, locales } from "@/i18n/routing";

import enMessages from "../../messages/en.json";
import frMessages from "../../messages/fr.json";

// Prevent static prerendering to avoid SSR hydration issues with theme provider
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function NotFound() {
  const localeCookie = (await cookies()).get("NEXT_LOCALE")?.value;
  const locale = locales.find((item) => item === localeCookie) ?? defaultLocale;
  const copy = locale === "fr" ? frMessages.notFound : enMessages.notFound;

  return (
    <main
      data-page="auth"
      className="flex min-h-svh items-center justify-center bg-background p-4"
    >
      <div className="flex w-full max-w-md flex-col gap-5">
        <div className="flex justify-center">
          <Link
            href={`/${locale}/chat`}
            className="inline-flex shrink-0 items-center"
            aria-label="Deodis"
          >
            <Image
              src="/deodis-logo.png"
              alt="Deodis"
              width={857}
              height={320}
              loading="eager"
              fetchPriority="high"
              className="h-8 w-auto"
            />
          </Link>
        </div>
        <Card>
          <CardHeader className="gap-2 text-center">
            <CardTitle asChild className="text-2xl">
              <h1>{copy.title}</h1>
            </CardTitle>
            <CardDescription>{copy.description}</CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center pb-6">
            <Button asChild>
              <Link href={`/${locale}/chat`}>{copy.return}</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
