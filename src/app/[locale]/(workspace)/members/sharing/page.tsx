import { redirect } from "@/i18n/navigation";

export default async function MembersSharingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect({
    href: { pathname: "/admin/settings", query: { tab: "platform" } },
    locale,
  });
}
