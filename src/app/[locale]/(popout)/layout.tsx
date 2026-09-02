import { redirect } from "@/i18n/navigation";
import type { Metadata } from "next";
import { getLocale } from "next-intl/server";

import { getSession } from "@/modules/auth/session";

export const metadata: Metadata = {
  title: "Code workspace",
};

// Pop-out windows show a single authenticated surface without the app shell.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function PopoutLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session?.user) {
    const locale = await getLocale();
    return redirect({ href: "/auth/signin", locale });
  }
  return <div className="h-dvh min-h-0 bg-background">{children}</div>;
}
