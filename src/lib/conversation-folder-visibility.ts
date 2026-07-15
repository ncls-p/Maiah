const STORAGE_KEY_PREFIX = "chat-conversation-folder-open";
const STORAGE_VERSION = "v1";
const MAX_PERSISTED_FOLDER_IDS = 500;

export const EMPTY_CONVERSATION_FOLDER_OPEN_SNAPSHOT = "[]";

export function conversationFolderOpenStorageKey(input: {
  workspaceId?: string | null;
  userId?: string | null;
}) {
  const workspaceId = input.workspaceId?.trim();
  const userId = input.userId?.trim();
  if (!workspaceId || !userId) return null;

  return [
    STORAGE_KEY_PREFIX,
    STORAGE_VERSION,
    encodeURIComponent(userId),
    encodeURIComponent(workspaceId),
  ].join(":");
}

export function parseConversationFolderOpenSnapshot(
  snapshot: string | null | undefined,
) {
  if (!snapshot) return new Set<string>();

  try {
    const parsed: unknown = JSON.parse(snapshot);
    if (!Array.isArray(parsed)) return new Set<string>();

    const folderIds = new Set<string>();
    for (const value of parsed) {
      if (typeof value !== "string") continue;
      const folderId = value.trim();
      if (!folderId) continue;
      folderIds.add(folderId);
      if (folderIds.size >= MAX_PERSISTED_FOLDER_IDS) break;
    }
    return folderIds;
  } catch {
    return new Set<string>();
  }
}

export function serializeConversationFolderOpenSnapshot(
  folderIds: Iterable<string>,
) {
  return JSON.stringify(
    [...new Set(folderIds)].filter(Boolean).sort((a, b) => a.localeCompare(b)),
  );
}

export function normalizeConversationFolderOpenSnapshot(
  snapshot: string | null | undefined,
) {
  return serializeConversationFolderOpenSnapshot(
    parseConversationFolderOpenSnapshot(snapshot),
  );
}

export function updateConversationFolderOpenSnapshot(input: {
  snapshot: string | null | undefined;
  folderId: string;
  open: boolean;
}) {
  const folderIds = parseConversationFolderOpenSnapshot(input.snapshot);
  const folderId = input.folderId.trim();
  if (!folderId) return serializeConversationFolderOpenSnapshot(folderIds);

  if (input.open) folderIds.add(folderId);
  else folderIds.delete(folderId);
  return serializeConversationFolderOpenSnapshot(folderIds);
}
