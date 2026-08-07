export const WORKSPACE_HISTORY_REFRESH_EVENT = "maiah:workspace-history-refresh";

export function notifyWorkspaceHistoryChanged() {
  window.dispatchEvent(new Event(WORKSPACE_HISTORY_REFRESH_EVENT));
}
