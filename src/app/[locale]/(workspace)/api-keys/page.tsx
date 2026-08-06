"use client";

import { RequireWorkspaceAccess } from "@/components/require-workspace-access";
import { WorkspaceApiKeys } from "@/components/workspace-api-keys";
import { WorkspacePage } from "@/components/workspace-page";
import { useTranslations } from "next-intl";

export default function ApiKeysPage() {
  const t = useTranslations("admin");

  return (
    <RequireWorkspaceAccess required="canManageApiKeys">
      <WorkspacePage title={t("apiKeysTitle")} description={t("apiKeysDescription")} width="narrow">
        <WorkspaceApiKeys />
      </WorkspacePage>
    </RequireWorkspaceAccess>
  );
}
