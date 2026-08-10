"use client";

import {
  useEffect,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";

import { CODE_WORKSPACE_ARTIFACT_EVENT } from "@/components/chat/chat-message-list";
import type { CodeWorkspaceArtifact } from "@/components/chat/chat-types";
import {
  CODING_INTERFACE_MODE,
  type InterfaceMode,
} from "./chat-interface-mode";

export function useCodeWorkspaceArtifactEvent({
  lastAutoOpenedWorkspaceRef,
  userSelectedInterfaceModeRef,
  setCodeWorkspaceArtifact,
  setInterfaceMode,
}: {
  lastAutoOpenedWorkspaceRef: MutableRefObject<string | null>;
  userSelectedInterfaceModeRef: MutableRefObject<InterfaceMode | null>;
  setCodeWorkspaceArtifact: Dispatch<
    SetStateAction<CodeWorkspaceArtifact | null>
  >;
  setInterfaceMode: Dispatch<SetStateAction<InterfaceMode>>;
}) {
  useEffect(() => {
    function handleCodeWorkspaceArtifact(event: Event) {
      const detail = (
        event as CustomEvent<{
          artifact?: CodeWorkspaceArtifact;
          activate?: boolean;
        }>
      ).detail;
      const artifact = detail?.artifact;
      if (!artifact?.projectId) return;
      setCodeWorkspaceArtifact((current) => {
        if (
          current?.projectId === artifact.projectId &&
          artifact.version <= current.version
        )
          return current;
        return artifact;
      });
      if (!detail.activate) return;
      const artifactKey = `${artifact.projectId}:${artifact.version}`;
      if (lastAutoOpenedWorkspaceRef.current === artifactKey) return;
      lastAutoOpenedWorkspaceRef.current = artifactKey;
      userSelectedInterfaceModeRef.current = CODING_INTERFACE_MODE;
      setInterfaceMode(CODING_INTERFACE_MODE);
    }
    window.addEventListener(
      CODE_WORKSPACE_ARTIFACT_EVENT,
      handleCodeWorkspaceArtifact,
    );
    return () =>
      window.removeEventListener(
        CODE_WORKSPACE_ARTIFACT_EVENT,
        handleCodeWorkspaceArtifact,
      );
  }, [
    lastAutoOpenedWorkspaceRef,
    setCodeWorkspaceArtifact,
    setInterfaceMode,
    userSelectedInterfaceModeRef,
  ]);
}
