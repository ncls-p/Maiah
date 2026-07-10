"use client";

import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BookMarkedIcon,
  CodeIcon,
  ServerIcon,
  ShieldIcon,
  WrenchIcon,
} from "lucide-react";

import { McpServerManager } from "@/components/mcp/mcp-server-manager";
import { CustomToolBuilder } from "@/components/custom-tools/custom-tool-builder";
import { PageLoading } from "@/components/page-loading";
import { SkillManager } from "@/components/skills/skill-manager";
import { WorkspacePage } from "@/components/workspace-page";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useWorkspace } from "@/hooks/use-workspace";
import { useRouter } from "@/i18n/navigation";
import { fetchWorkspacePermissions } from "@/lib/api-client";
import {
  DEFAULT_WORKSPACE_PERMISSIONS,
  type WorkspacePermissions,
} from "@/lib/workspace-nav";

import { ToolApprovalsPanel } from "./approvals-panel";
import { BuiltinToolsPanel } from "./builtin-tools-panel";

type ToolsTab = "builtin" | "mcp" | "skills" | "custom" | "approvals";

const TOOL_TAB_CONFIG = [
  {
    value: "builtin",
    icon: WrenchIcon,
    labelKey: "tabs.builtin",
    helpKey: null,
    canView: (permissions: WorkspacePermissions) =>
      permissions.canViewTools || permissions.canConfigureTools,
    render: () => <BuiltinToolsPanel />,
  },
  {
    value: "mcp",
    icon: ServerIcon,
    labelKey: "tabs.mcp",
    helpKey: "mcpHelp",
    canView: (permissions: WorkspacePermissions) =>
      permissions.canGetMcpServers,
    render: () => <McpServerManager />,
  },
  {
    value: "skills",
    icon: BookMarkedIcon,
    labelKey: "tabs.skills",
    helpKey: "skillsHelp",
    canView: (permissions: WorkspacePermissions) =>
      permissions.canConfigureTools,
    render: () => <SkillManager />,
  },
  {
    value: "custom",
    icon: CodeIcon,
    labelKey: "tabs.custom",
    helpKey: "customHelp",
    canView: (permissions: WorkspacePermissions) =>
      permissions.canConfigureTools,
    render: () => <CustomToolBuilder />,
  },
  {
    value: "approvals",
    icon: ShieldIcon,
    labelKey: "tabs.approvals",
    helpKey: "approvalsHelp",
    canView: (permissions: WorkspacePermissions) =>
      permissions.canViewTools || permissions.canConfigureTools,
    render: () => <ToolApprovalsPanel />,
  },
] as const;

function allowedToolTabs(permissions: WorkspacePermissions) {
  return TOOL_TAB_CONFIG.filter((item) => item.canView(permissions));
}

export function ToolsHub() {
  const t = useTranslations("tools");
  const router = useRouter();
  const searchParams = useSearchParams();
  const { workspaceId, isLoading: workspaceLoading } = useWorkspace();
  const [permissions, setPermissions] = useState<WorkspacePermissions>(
    DEFAULT_WORKSPACE_PERMISSIONS,
  );
  const [permissionsLoading, setPermissionsLoading] = useState(true);
  const [permissionsError, setPermissionsError] = useState(false);
  const allowedTabs = useMemo(
    () => allowedToolTabs(permissions),
    [permissions],
  );
  const allowedTabValues = allowedTabs.map((item) => item.value);
  const requestedTab = searchParams.get("tab") ?? "builtin";
  const tab = allowedTabValues.includes(requestedTab as ToolsTab)
    ? requestedTab
    : (allowedTabValues[0] ?? "builtin");

  const loadPermissions = useCallback(async () => {
    if (!workspaceId) return;
    setPermissionsLoading(true);
    setPermissionsError(false);
    try {
      setPermissions(await fetchWorkspacePermissions(workspaceId));
    } catch {
      setPermissions(DEFAULT_WORKSPACE_PERMISSIONS);
      setPermissionsError(true);
    } finally {
      setPermissionsLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    let cancelled = false;
    const timeout = window.setTimeout(() => {
      if (!cancelled) void loadPermissions();
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [loadPermissions]);

  useEffect(() => {
    if (
      !permissionsLoading &&
      allowedTabValues.length > 0 &&
      requestedTab !== tab
    ) {
      router.replace(`/tools?tab=${tab}`);
    }
  }, [allowedTabValues.length, permissionsLoading, requestedTab, router, tab]);

  function setTab(value: string) {
    router.replace(`/tools?tab=${value}`);
  }

  if (workspaceLoading || !workspaceId || permissionsLoading) {
    return <PageLoading label={t("permissionsLoading")} />;
  }

  if (permissionsError) {
    return (
      <WorkspacePage
        title={t("title")}
        description={t("description")}
        width="wide"
      >
        <div
          className="rounded-2xl border border-destructive/25 bg-destructive/5 p-5"
          role="alert"
        >
          <h2 className="text-base font-semibold">{t("loadFailed")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("loadFailedDescription")}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => void loadPermissions()}
          >
            {t("retry")}
          </Button>
        </div>
      </WorkspacePage>
    );
  }

  if (allowedTabs.length === 0) {
    return (
      <WorkspacePage
        title={t("title")}
        description={t("description")}
        width="wide"
      >
        <div className="rounded-2xl border bg-card p-5">
          <h2 className="text-base font-semibold">{t("noAccessTitle")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("noAccessDescription")}
          </p>
        </div>
      </WorkspacePage>
    );
  }

  return (
    <WorkspacePage
      title={t("title")}
      description={t("description")}
      width="wide"
    >
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full flex-wrap sm:w-auto">
          {allowedTabs.map((item) => {
            const Icon = item.icon;
            return (
              <TabsTrigger
                key={item.value}
                value={item.value}
                className="gap-1.5"
              >
                <Icon className="size-3.5" aria-hidden="true" />
                {t(item.labelKey)}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {allowedTabs.map((item) => (
          <TabsContent
            key={item.value}
            value={item.value}
            className={item.helpKey ? "mt-6 space-y-4" : "mt-6"}
          >
            {item.helpKey ? (
              <p className="text-sm text-muted-foreground">{t(item.helpKey)}</p>
            ) : null}
            {item.render()}
          </TabsContent>
        ))}
      </Tabs>
    </WorkspacePage>
  );
}
