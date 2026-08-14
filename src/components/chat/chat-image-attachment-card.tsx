"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import type { ChatImageAttachment } from "@/components/chat/chat-types";
import { FilePreviewDialog } from "@/components/chat/file-preview";
import { formatBytes } from "./code-workspace-artifact-card.button-type";

export function ChatImageAttachmentCard({
  attachment,
}: {
  attachment: ChatImageAttachment;
}) {
  const t = useTranslations("chat.artifacts");
  const [previewOpen, setPreviewOpen] = useState(false);
  const typeLabel = attachment.mimeType.replace("image/", "").toUpperCase();
  const subtitle = `${typeLabel} · ${formatBytes(attachment.size)}`;

  return (
    <>
      <figure className="w-fit max-w-full overflow-hidden rounded-xl bg-background/70 shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--border)_70%,transparent)]">
        <button
          type="button"
          className="block max-w-full cursor-zoom-in border-0 bg-transparent p-0"
          onClick={() => setPreviewOpen(true)}
          aria-label={t("view")}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={attachment.url}
            alt={attachment.fileName}
            className="max-h-[min(20rem,50vh)] w-auto max-w-full object-contain outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10"
          />
        </button>
        <figcaption className="min-w-0 px-3 py-2">
          <span className="block truncate text-xs font-medium text-foreground">
            {attachment.fileName}
          </span>
          <span className="mt-0.5 block text-[11px] text-muted-foreground">
            {subtitle}
          </span>
        </figcaption>
      </figure>
      <FilePreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        fileName={attachment.fileName}
        url={attachment.url}
        mimeType={attachment.mimeType}
        subtitle={subtitle}
        previewText={null}
        previewError={null}
        loadingPreview={false}
      />
    </>
  );
}
