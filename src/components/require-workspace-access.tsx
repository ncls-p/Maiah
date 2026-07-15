"use client";

import { useEffect, useMemo, useState } from "react";
import { ShieldAlertIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { PageEmptyState } from "@/components/page-empty-state";
import { PageLoading } from "@/components/page-loading";
import { Button } from "@/components/ui/button";
import { WorkspacePage } from "@/components/workspace-page";
import { useWorkspace } from "@/hooks/use-workspace";
import { Link, useRouter } from "@/i18n/navigation";
import { fetchWorkspacePermissions } from "@/lib/api-client";
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
  const requiredValue = Array.isArray(required) ? required.join(",") : required;
  const requiredKey = `${mode}:${requiredValue}`;
  const requiredPermissions = useMemo(
    () => requiredValue.split(",") as WorkspacePermissionKey[],
    [requiredValue],
  );
  const [access, setAccess] = useState<{
    status: "allowed" | "denied" | "error";
    workspaceId: string;
    requiredKey: string;
  } | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (isLoading) return;
    if (!workspaceId) {
      router.replace(redirectTo);
      return;
    }

    const currentWorkspaceId = workspaceId;
    let cancelled = false;

    async function checkAccess() {
      try {
        const permissions = await fetchWorkspacePermissions(currentWorkspaceId);
        if (cancelled) return;
        if (isAllowed(permissions, requiredPermissions, mode)) {
          setAccess({
            status: "allowed",
            workspaceId: currentWorkspaceId,
            requiredKey,
          });
          return;
        }
        if (!cancelled) {
          setAccess({
            status: "denied",
            workspaceId: currentWorkspaceId,
            requiredKey,
          });
        }
      } catch {
        if (!cancelled) {
          setAccess({
            status: "error",
            workspaceId: currentWorkspaceId,
            requiredKey,
          });
        }
      }
    }

    void checkAccess();
    return () => {
      cancelled = true;
    };
  }, [
    isLoading,
    mode,
    redirectTo,
    requiredKey,
    requiredPermissions,
    retryKey,
    router,
    workspaceId,
  ]);

  const isCurrentAccessState =
    access?.workspaceId === workspaceId && access.requiredKey === requiredKey;

  if (!isCurrentAccessState) {
    return <PageLoading label={t("checkingAccess")} />;
  }

  if (access.status === "error") {
    return (
      <WorkspacePage title={t("accessCheckFailedTitle")} width="default">
        <PageEmptyState
          icon={ShieldAlertIcon}
          title={t("accessCheckFailedTitle")}
          description={t("accessCheckFailedDescription")}
          className="border border-border/70"
        >
          <Button
            type="button"
            onClick={() => {
              setAccess(null);
              setRetryKey((value) => value + 1);
            }}
          >
            {t("retryAccess")}
          </Button>
        </PageEmptyState>
      </WorkspacePage>
    );
  }

  if (access.status === "denied") {
    return (
      <WorkspacePage title={t("accessDeniedTitle")} width="default">
        <PageEmptyState
          icon={ShieldAlertIcon}
          title={t("accessDeniedTitle")}
          description={t("accessDeniedDescription")}
          className="border border-border/70"
        >
          <Button asChild>
            <Link href={redirectTo}>{t("backToChat")}</Link>
          </Button>
        </PageEmptyState>
      </WorkspacePage>
    );
  }

  return children;
}
