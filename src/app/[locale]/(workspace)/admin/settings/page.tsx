import { redirect } from "@/i18n/navigation";

export default async function AdminSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ tab?: string; organizationId?: string }>;
}) {
  const { locale } = await params;
  const { tab, organizationId } = await searchParams;
  redirect({
    href: {
      pathname:
        tab === "platform"
          ? "/admin/settings/registration"
          : "/admin/settings/organizations",
      ...(organizationId ? { query: { organizationId } } : {}),
    },
    locale,
  });
}
