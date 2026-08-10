import { redirect } from "@/i18n/navigation";

export default async function CustomToolsRedirectPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect({ href: "/workflows", locale });
}
