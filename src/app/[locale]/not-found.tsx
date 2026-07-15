import Image from "next/image";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Link } from "@/i18n/navigation";

export default async function LocaleNotFound() {
  const t = await getTranslations("notFound");

  return (
    <main
      data-page="auth"
      className="flex min-h-svh items-center justify-center bg-background p-4"
    >
      <div className="flex w-full max-w-md flex-col gap-5">
        <div className="flex justify-center">
          <Link
            href="/chat"
            className="inline-flex shrink-0 items-center"
            aria-label="Deodis"
          >
            <Image
              src="/deodis-logo.png"
              alt="Deodis"
              width={857}
              height={320}
              className="h-8 w-auto"
            />
          </Link>
        </div>
        <Card>
          <CardHeader className="gap-2 text-center">
            <CardTitle asChild className="text-2xl">
              <h1>{t("title")}</h1>
            </CardTitle>
            <CardDescription>{t("description")}</CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center pb-6">
            <Button asChild>
              <Link href="/chat">{t("return")}</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
