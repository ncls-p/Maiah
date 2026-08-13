"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { applyOrganizationTheme } from "@/components/organization-theme";
import {
  WorkspaceContext,
  type WorkspaceContextValue,
  type WorkspaceSummary,
} from "@/hooks/use-workspace";
import { fetchWorkspaces, saveActiveWorkspace } from "@/lib/api-client";
import {
  ACTIVE_WORKSPACE_STORAGE_KEY,
  resolveActiveWorkspaceId,
} from "@/lib/workspace-selection";

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [workspaceId, setWorkspaceIdState] = useState<string | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const setWorkspaceId = useCallback((nextWorkspaceId: string) => {
    setWorkspaceIdState(nextWorkspaceId);
    window.localStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, nextWorkspaceId);
    void saveActiveWorkspace(nextWorkspaceId);
  }, []);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const rows = await fetchWorkspaces();
      setWorkspaces(rows);
      const storedWorkspaceId = window.localStorage.getItem(
        ACTIVE_WORKSPACE_STORAGE_KEY,
      );
      const active = resolveActiveWorkspaceId(rows, {
        currentWorkspaceId: workspaceId,
        storedWorkspaceId,
      });
      if (active) {
        setWorkspaceIdState(active);
        window.localStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, active);
        const hasServerPreference = rows.some((row) => row.isActive);
        if (!hasServerPreference) void saveActiveWorkspace(active);
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

  const activeWorkspace = workspaces.find(
    (workspace) => workspace.id === workspaceId,
  );

  useEffect(() => {
    if (!activeWorkspace) return;
    applyOrganizationTheme(
      activeWorkspace.organizationTheme,
      activeWorkspace.organizationThemeConfig,
    );
  }, [activeWorkspace]);

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      workspaceId,
      workspaces,
      organizationName: activeWorkspace?.organizationName ?? null,
      organizationLogoUrl: activeWorkspace?.organizationLogoUrl ?? null,
      organizationTheme: activeWorkspace?.organizationTheme ?? "ocean",
      organizationThemeConfig: activeWorkspace?.organizationThemeConfig ?? null,
      organizationHeroConfig: activeWorkspace?.organizationHeroConfig ?? null,
      isLoading,
      error,
      setWorkspaceId,
      refresh,
    }),
    [
      workspaceId,
      workspaces,
      activeWorkspace?.organizationName,
      activeWorkspace?.organizationLogoUrl,
      activeWorkspace?.organizationTheme,
      activeWorkspace?.organizationThemeConfig,
      activeWorkspace?.organizationHeroConfig,
      isLoading,
      error,
      setWorkspaceId,
      refresh,
    ],
  );

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}
