import { getTranslations } from "next-intl/server";
import { OrganizationConnections } from "@/components/admin/organization-connections";
import { WorkspacePage } from "@/components/workspace-page";
import { getSession } from "@/modules/auth/session";

export default async function ConnectionsPage() {
  const t = await getTranslations("connections");
  const session = await getSession();
  if (!session) return null;
  return (
    <WorkspacePage title={t("title")} description={t("description")}>
      <OrganizationConnections />
    </WorkspacePage>
  );
}
