import { MembersAccessConsole } from "@/components/iam/members-access-console";
import { redirect } from "@/i18n/navigation";
import { accessLegacyRedirectPath, queryParam } from "@/lib/access-routes";

export default async function MembersPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const query = await searchParams;
  const target = accessLegacyRedirectPath(
    queryParam(query.section),
    queryParam(query.tab),
  );
  if (target) {
    redirect({
      href: target.query
        ? { pathname: target.pathname, query: target.query }
        : target.pathname,
      locale,
    });
  }
  return <MembersAccessConsole section="people" />;
}
