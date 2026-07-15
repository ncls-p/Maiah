"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

import {
  conversationFolderOpenStorageKey,
  EMPTY_CONVERSATION_FOLDER_OPEN_SNAPSHOT,
  normalizeConversationFolderOpenSnapshot,
  parseConversationFolderOpenSnapshot,
  updateConversationFolderOpenSnapshot,
} from "@/lib/conversation-folder-visibility";

const STORAGE_CHANGE_EVENT = "chat-conversation-folder-open-change";
const memorySnapshots = new Map<string, string>();
const memoryOnlyStorageKeys = new Set<string>();

function readSnapshot(storageKey: string | null) {
  if (!storageKey) return EMPTY_CONVERSATION_FOLDER_OPEN_SNAPSHOT;
  if (memoryOnlyStorageKeys.has(storageKey)) {
    return (
      memorySnapshots.get(storageKey) ?? EMPTY_CONVERSATION_FOLDER_OPEN_SNAPSHOT
    );
  }

  try {
    const snapshot = normalizeConversationFolderOpenSnapshot(
      window.localStorage.getItem(storageKey),
    );
    memorySnapshots.set(storageKey, snapshot);
    return snapshot;
  } catch {
    return (
      memorySnapshots.get(storageKey) ?? EMPTY_CONVERSATION_FOLDER_OPEN_SNAPSHOT
    );
  }
}

function writeSnapshot(storageKey: string, snapshot: string) {
  memorySnapshots.set(storageKey, snapshot);
  try {
    window.localStorage.setItem(storageKey, snapshot);
    memoryOnlyStorageKeys.delete(storageKey);
  } catch {
    // Keep the preference in memory when browser storage is unavailable.
    memoryOnlyStorageKeys.add(storageKey);
  }
  window.dispatchEvent(
    new CustomEvent(STORAGE_CHANGE_EVENT, { detail: storageKey }),
  );
}

function subscribeToSnapshot(storageKey: string | null, callback: () => void) {
  if (!storageKey) return () => undefined;

  function handleStorage(event: StorageEvent) {
    if (event.key === storageKey) callback();
  }

  function handleLocalChange(event: Event) {
    if (event instanceof CustomEvent && event.detail === storageKey) {
      callback();
    }
  }

  window.addEventListener("storage", handleStorage);
  window.addEventListener(STORAGE_CHANGE_EVENT, handleLocalChange);
  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(STORAGE_CHANGE_EVENT, handleLocalChange);
  };
}

export function useConversationFolderVisibility(input: {
  workspaceId?: string | null;
  userId?: string | null;
}) {
  const storageKey = conversationFolderOpenStorageKey(input);
  const subscribe = useCallback(
    (callback: () => void) => subscribeToSnapshot(storageKey, callback),
    [storageKey],
  );
  const getSnapshot = useCallback(() => readSnapshot(storageKey), [storageKey]);
  const snapshot = useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => EMPTY_CONVERSATION_FOLDER_OPEN_SNAPSHOT,
  );
  const openFolderIds = useMemo(
    () => parseConversationFolderOpenSnapshot(snapshot),
    [snapshot],
  );
  const setFolderOpen = useCallback(
    (folderId: string, open: boolean) => {
      if (!storageKey) return;
      writeSnapshot(
        storageKey,
        updateConversationFolderOpenSnapshot({
          snapshot: readSnapshot(storageKey),
          folderId,
          open,
        }),
      );
    },
    [storageKey],
  );

  return { openFolderIds, setFolderOpen };
}
