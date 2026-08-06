"use client";

import { useCallback,useEffect,useMemo,useState } from "react";

import { WorkspaceContext,type WorkspaceContextValue,type WorkspaceSummary } from "@/hooks/use-workspace";
import { fetchWorkspaces } from "@/lib/api-client";
import { resolveOrganizationTheme,themeCss,type OrganizationTheme } from "@/modules/organization/themes";

const ACTIVE_WORKSPACE_KEY = "active-workspace-id";

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [workspaceId, setWorkspaceIdState] = useState<string | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const setWorkspaceId = useCallback((nextWorkspaceId: string) => {
    setWorkspaceIdState(nextWorkspaceId);
    window.localStorage.setItem(ACTIVE_WORKSPACE_KEY, nextWorkspaceId);
  }, []);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const rows = await fetchWorkspaces();
      setWorkspaces(rows);
      const storedWorkspaceId = window.localStorage.getItem(ACTIVE_WORKSPACE_KEY);
      const active = rows.find((row) => row.id === workspaceId)?.id ?? rows.find((row) => row.id === storedWorkspaceId)?.id ?? rows[0]?.id ?? null;
      if (active) {
        setWorkspaceIdState(active);
        window.localStorage.setItem(ACTIVE_WORKSPACE_KEY, active);
      } else {
        setWorkspaceIdState(null);
        setError("Setup required");
      }
    } catch {
      setError("Unable to load setup");
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    if (workspaceId && workspaces.length > 0) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async workspace bootstrap
    void refresh();
  }, [workspaceId, workspaces.length, refresh]);

  const activeWorkspace = workspaces.find((workspace) => workspace.id === workspaceId);

  useEffect(() => {
    const themeName = (activeWorkspace?.organizationTheme ?? "ocean") as OrganizationTheme;
    document.documentElement.dataset.brandTheme = themeName;
    let style = document.querySelector<HTMLStyleElement>("style[data-organization-theme]");
    if (!style) {
      style = document.createElement("style");
      style.dataset.organizationTheme = "true";
      document.head.append(style);
    }
    style.textContent = themeCss(resolveOrganizationTheme(themeName, activeWorkspace?.organizationThemeConfig));
  }, [activeWorkspace?.organizationTheme, activeWorkspace?.organizationThemeConfig]);

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      workspaceId,
      workspaces,
      organizationName: activeWorkspace?.organizationName ?? null,
      organizationLogoUrl: activeWorkspace?.organizationLogoUrl ?? null,
      organizationTheme: activeWorkspace?.organizationTheme ?? "ocean",
      organizationThemeConfig: activeWorkspace?.organizationThemeConfig ?? null,
      isLoading,
      error,
      setWorkspaceId,
      refresh,
    }),
    [workspaceId, workspaces, activeWorkspace?.organizationName, activeWorkspace?.organizationLogoUrl, activeWorkspace?.organizationTheme, activeWorkspace?.organizationThemeConfig, isLoading, error, setWorkspaceId, refresh],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}
