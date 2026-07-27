"use client";

import { code } from "@streamdown/code";
import { createMathPlugin } from "@streamdown/math";
import { useTranslations } from "next-intl";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import {
  Streamdown,
  type LinkSafetyConfig,
  type LinkSafetyModalProps,
} from "streamdown";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const streamdownMath = createMathPlugin({ singleDollarTextMath: true });
const STREAMDOWN_PLUGINS = { code, math: streamdownMath };

function isTrustedInternalLink(url: string) {
  if (typeof window === "undefined") return false;
  try {
    const parsed = new URL(url, window.location.origin);
    return parsed.origin === window.location.origin;
  } catch {
    return false;
  }
}

function ExternalLinkSafetyModal({
  url,
  isOpen,
  onClose,
  onConfirm,
}: LinkSafetyModalProps) {
  const t = useTranslations("chat.rendering");
  if (!isOpen || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-background/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="external-link-title"
        className="w-full max-w-md rounded-2xl border bg-card p-5 text-sm shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h2
          id="external-link-title"
          className="text-base font-semibold text-foreground"
        >
          {t("externalLinkTitle")}
        </h2>
        <p className="mt-2 text-muted-foreground">
          {t("externalLinkDescription")}
        </p>
        <p className="mt-3 break-all rounded-lg bg-muted/50 p-2 font-mono text-xs text-muted-foreground">
          {url}
        </p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              void navigator.clipboard
                .writeText(url)
                .then(() => toast.success(t("linkCopied")))
                .catch(() => toast.error(t("linkCopyFailed")));
            }}
          >
            {t("copyLink")}
          </Button>
          <Button type="button" onClick={onConfirm}>
            {t("openLink")}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

const STREAMDOWN_LINK_SAFETY: LinkSafetyConfig = {
  enabled: true,
  onLinkCheck: isTrustedInternalLink,
  renderModal: (props) => <ExternalLinkSafetyModal {...props} />,
};

export function ChatMarkdown({
  children,
  className,
  isAnimating = false,
}: {
  children: string;
  className?: string;
  isAnimating?: boolean;
}) {
  return (
    <Streamdown
      plugins={STREAMDOWN_PLUGINS}
      linkSafety={STREAMDOWN_LINK_SAFETY}
      caret="block"
      isAnimating={isAnimating}
      className={cn("streaming-markdown text-sm", className)}
    >
      {children}
    </Streamdown>
  );
}
