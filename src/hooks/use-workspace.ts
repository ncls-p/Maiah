"use client";

import { createContext, useContext } from "react";

export type WorkspaceSummary = {
  id: string;
  name: string;
  slug: string;
  organizationId: string;
  organizationName: string;
  organizationLogoUrl: string | null;
  organizationTheme: string;
};

export type WorkspaceContextValue = {
  workspaceId: string | null;
  workspaces: WorkspaceSummary[];
  organizationName: string | null;
  organizationLogoUrl: string | null;
  organizationTheme: string;
  isLoading: boolean;
  error: string | null;
  setWorkspaceId: (workspaceId: string) => void;
  refresh: () => Promise<void>;
};

export const WorkspaceContext = createContext<WorkspaceContextValue | null>(
  null,
);

export function useWorkspace(): WorkspaceContextValue {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error("useWorkspace must be used within WorkspaceProvider");
  }
  return context;
}
