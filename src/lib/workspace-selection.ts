export const ACTIVE_WORKSPACE_STORAGE_KEY = "active-workspace-id";

type WorkspaceSelectionCandidate = {
  id: string;
  isActive: boolean;
};

export function resolveActiveWorkspaceId(
  workspaces: WorkspaceSelectionCandidate[],
  options: {
    currentWorkspaceId: string | null;
    storedWorkspaceId: string | null;
  },
) {
  return (
    workspaces.find(({ id }) => id === options.currentWorkspaceId)?.id ??
    workspaces.find(({ isActive }) => isActive)?.id ??
    workspaces.find(({ id }) => id === options.storedWorkspaceId)?.id ??
    workspaces[0]?.id ??
    null
  );
}
