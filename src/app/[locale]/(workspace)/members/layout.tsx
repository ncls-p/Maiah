import { AccessPageNavigation } from "@/components/iam/access-page-navigation";
import { AccessProjectSelector } from "@/components/iam/access-project-selector";
import { WorkspacePage } from "@/components/workspace-page";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

export default async function MembersLayout({
  children,
}: {
  children: ReactNode;
}) {
  const t = await getTranslations("access");

  return (
    <WorkspacePage
      title={t("title")}
      width="wide"
      headerVariant="compact"
      showKicker={false}
      actions={<AccessProjectSelector variant="breadcrumb" />}
    >
      <AccessPageNavigation>{children}</AccessPageNavigation>
    </WorkspacePage>
  );
}
