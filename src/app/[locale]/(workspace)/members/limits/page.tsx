import { redirect } from "@/i18n/navigation";

export default async function MembersLimitsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect({
    href: "/admin/settings/limits",
    locale,
  });
}
