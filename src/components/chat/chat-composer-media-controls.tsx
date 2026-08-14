"use client";

import { CameraIcon, Loader2Icon, MicIcon, PaperclipIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export const COMPOSER_FILE_ACCEPT = [
  "image/*",
  "image/heic",
  "image/heif",
  "application/pdf",
  "application/zip",
  ".pdf",
  ".txt",
  ".md",
  ".csv",
  ".json",
  ".zip",
  ".doc",
  ".docx",
  ".ppt",
  ".pptx",
  ".xls",
  ".xlsx",
].join(",");

function ComposerIconButton({
  label,
  disabled,
  pressed,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  pressed?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      className={cn(
        "size-10 shrink-0 rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground",
        pressed &&
          "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary",
      )}
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

export function ChatComposerMediaControls({
  disabled,
  uploading,
  sending,
  listening,
  onFileChange,
  onToggleDictation,
}: {
  disabled: boolean;
  uploading: boolean;
  sending: boolean;
  listening: boolean;
  onFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onToggleDictation: () => void;
}) {
  const t = useTranslations("chat.composer");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [cameraAvailable, setCameraAvailable] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(pointer: coarse)");
    const sync = () => setCameraAvailable(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  const attachDisabled = disabled || uploading || sending;
  const attachIcon = uploading ? (
    <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
  ) : (
    <PaperclipIcon className="size-4" aria-hidden="true" />
  );

  return (
    <div className="flex items-center">
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        multiple
        accept={COMPOSER_FILE_ACCEPT}
        onChange={onFileChange}
      />
      <input
        ref={cameraInputRef}
        type="file"
        className="hidden"
        accept="image/*"
        capture="environment"
        onChange={onFileChange}
      />
      {cameraAvailable ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-10 shrink-0 rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label={t("uploadFiles")}
              disabled={attachDisabled}
            >
              {attachIcon}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-44">
            <DropdownMenuItem
              className="min-h-10 gap-2"
              onSelect={() => fileInputRef.current?.click()}
            >
              <PaperclipIcon className="size-4" aria-hidden="true" />
              {t("uploadFiles")}
            </DropdownMenuItem>
            <DropdownMenuItem
              className="min-h-10 gap-2"
              onSelect={() => cameraInputRef.current?.click()}
            >
              <CameraIcon className="size-4" aria-hidden="true" />
              {t("takePhoto")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <ComposerIconButton
          label={t("uploadFiles")}
          disabled={attachDisabled}
          onClick={() => fileInputRef.current?.click()}
        >
          {attachIcon}
        </ComposerIconButton>
      )}
      <ComposerIconButton
        label={listening ? t("dictationListening") : t("dictation")}
        disabled={disabled}
        pressed={listening}
        onClick={onToggleDictation}
      >
        <MicIcon className="size-4" aria-hidden="true" />
      </ComposerIconButton>
    </div>
  );
}
