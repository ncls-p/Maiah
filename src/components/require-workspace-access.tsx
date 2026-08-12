"use client";

import { ShieldAlertIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo } from "react";

import { useWorkspaceShell } from "@/components/app-shell";
import { PageEmptyState } from "@/components/page-empty-state";
import { PageLoading } from "@/components/page-loading";
import { Button } from "@/components/ui/button";
import { WorkspacePage } from "@/components/workspace-page";
import { useWorkspace } from "@/hooks/use-workspace";
import { Link, useRouter } from "@/i18n/navigation";
import type { WorkspacePermissions } from "@/lib/workspace-nav";

type WorkspacePermissionKey = keyof WorkspacePermissions;

type AccessMode = "all" | "any";

function isAllowed(
  permissions: WorkspacePermissions,
  required: WorkspacePermissionKey[],
  mode: AccessMode,
) {
  if (required.length === 0) return true;
  return mode === "all"
    ? required.every((permission) => permissions[permission])
    : required.some((permission) => permissions[permission]);
}

export function RequireWorkspaceAccess({
  children,
  required,
  mode = "all",
  redirectTo = "/chat",
}: {
  children: React.ReactNode;
  required: WorkspacePermissionKey | WorkspacePermissionKey[];
  mode?: AccessMode;
  redirectTo?: string;
}) {
  const router = useRouter();
  const t = useTranslations("shell");
  const { workspaceId, isLoading } = useWorkspace();
  const { permissions, permissionsReady } = useWorkspaceShell();
  const requiredPermissions = useMemo(
    () => (Array.isArray(required) ? required : [required]),
    [required],
  );

  const allowed =
    permissionsReady && isAllowed(permissions, requiredPermissions, mode);

  useEffect(() => {
    if (isLoading) return;
    if (!workspaceId) {
      router.replace(redirectTo, { scroll: false });
    }
  }, [isLoading, redirectTo, router, workspaceId]);

  // Shell already holds permissions for the session — only wait on first load.
  if (isLoading || !workspaceId || !permissionsReady) {
    return <PageLoading label={t("checkingAccess")} />;
  }

  if (!allowed) {
    return (
      <WorkspacePage title={t("accessDeniedTitle")} width="default">
        <PageEmptyState
          icon={ShieldAlertIcon}
          title={t("accessDeniedTitle")}
          description={t("accessDeniedDescription")}
          className="border border-border/70"
        >
          <Button asChild>
            <Link href={redirectTo} scroll={false}>
              {t("backToChat")}
            </Link>
          </Button>
        </PageEmptyState>
      </WorkspacePage>
    );
  }

  return children;
}
