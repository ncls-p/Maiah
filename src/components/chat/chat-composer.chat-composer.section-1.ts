"use client";

import { useTranslations } from "next-intl";
import type * as React from "react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import {
  type ChatComposerProps,
  dataTransferContainsFiles,
  filesFromDataTransfer,
  isDirectCodeFile,
  uploadedFilePath,
} from "./chat-composer.queued-chat-message";

export function useComposerFileUploads({
  needsSetup,
  sending,
  onUploadCodeWorkspace,
  onUploadChatAttachment,
}: {
  needsSetup: boolean;
  sending: boolean;
  onUploadCodeWorkspace?: ChatComposerProps["onUploadCodeWorkspace"];
  onUploadChatAttachment?: ChatComposerProps["onUploadChatAttachment"];
}) {
  const t = useTranslations("chat.composer");
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [draggingFiles, setDraggingFiles] = useState(false);

  const handleSelectedFiles = useCallback(
    async (files: File[]) => {
      const uploadedFiles = files.filter(Boolean);
      if (uploadedFiles.length === 0 || uploadingAttachment || needsSetup)
        return;
      if (sending) {
        toast.error(t("waitForResponse"));
        return;
      }
      setUploadingAttachment(true);
      try {
        const zipFiles = uploadedFiles.filter((file) =>
          file.name.toLowerCase().endsWith(".zip"),
        );
        const codeFiles = uploadedFiles.filter(isDirectCodeFile);
        if (zipFiles.length > 0) {
          if (uploadedFiles.length > 1) {
            toast.error(t("singleZip"));
            return;
          }
          await onUploadCodeWorkspace?.(zipFiles);
          return;
        }
        if (
          codeFiles.length === uploadedFiles.length &&
          codeFiles.some((file) => /\.html?$/i.test(uploadedFilePath(file)))
        ) {
          await onUploadCodeWorkspace?.(codeFiles);
          return;
        }
        if (!onUploadChatAttachment) {
          toast.error(t("unavailable"));
          return;
        }
        for (const file of uploadedFiles) await onUploadChatAttachment(file);
      } finally {
        setUploadingAttachment(false);
      }
    },
    [
      needsSetup,
      onUploadChatAttachment,
      onUploadCodeWorkspace,
      sending,
      t,
      uploadingAttachment,
    ],
  );

  useEffect(() => {
    let dragDepth = 0;
    function resetFileDrag() {
      dragDepth = 0;
      setDraggingFiles(false);
    }
    function onDragEnter(event: DragEvent) {
      if (!dataTransferContainsFiles(event.dataTransfer)) return;
      event.preventDefault();
      dragDepth += 1;
      setDraggingFiles(true);
    }
    function onDragOver(event: DragEvent) {
      if (!dataTransferContainsFiles(event.dataTransfer)) return;
      event.preventDefault();
      if (event.dataTransfer)
        event.dataTransfer.dropEffect =
          !needsSetup && !sending && !uploadingAttachment ? "copy" : "none";
    }
    function onDragLeave() {
      if (dragDepth === 0) return;
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0) setDraggingFiles(false);
    }
    function onDrop(event: DragEvent) {
      if (!dataTransferContainsFiles(event.dataTransfer)) return;
      event.preventDefault();
      resetFileDrag();
      if (event.dataTransfer)
        void handleSelectedFiles(filesFromDataTransfer(event.dataTransfer));
    }
    document.addEventListener("dragenter", onDragEnter);
    document.addEventListener("dragover", onDragOver);
    document.addEventListener("dragleave", onDragLeave);
    document.addEventListener("drop", onDrop);
    window.addEventListener("blur", resetFileDrag);
    return () => {
      document.removeEventListener("dragenter", onDragEnter);
      document.removeEventListener("dragover", onDragOver);
      document.removeEventListener("dragleave", onDragLeave);
      document.removeEventListener("drop", onDrop);
      window.removeEventListener("blur", resetFileDrag);
    };
  }, [handleSelectedFiles, needsSetup, sending, uploadingAttachment]);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    await handleSelectedFiles(files);
  }

  return {
    uploadingAttachment,
    draggingFiles,
    handleSelectedFiles,
    handleFileChange,
  };
}
