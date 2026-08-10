"use client";

import { useTranslations } from "next-intl";

import { type ResourceProvenance } from "@/components/resource-provenance-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BookMarkedIcon, EyeIcon, FileTextIcon } from "lucide-react";
import { useState } from "react";

export const BUTTON_TYPE = "button";
export const SKILLS_PAGE_SIZE = 24;

export type AgentSkill = {
  id: string;
  name: string;
  description: string | null;
  sourcePackage: string | null;
  sourceSkillName: string | null;
  installCommand: string | null;
  markdownFilesJson: SkillMarkdownFile[];
  metadataJson: unknown;
  isGlobal: boolean;
  canEdit: boolean;
  createdAt: string;
  provenance: ResourceProvenance;
};

type SkillMarkdownFile = {
  path: string;
  content: string;
};

export type SkillPreview = {
  name: string;
  description: string | null;
  markdownFiles: SkillMarkdownFile[];
  sourcePackage: string;
};

export function fileCount(files: unknown): number {
  return Array.isArray(files) ? files.length : 0;
}

export function isManual(skill: AgentSkill): boolean {
  return !skill.sourcePackage && !skill.installCommand;
}

// ─── Skill Detail Dialog ───────────────────────────────────────────────

export function SkillDetailDialog({ skill }: { skill: AgentSkill }) {
  const t = useTranslations("tools.skills");
  const [activeFile, setActiveFile] = useState(0);
  const files = Array.isArray(skill.markdownFilesJson)
    ? (skill.markdownFilesJson as SkillMarkdownFile[])
    : [];
  const currentFile = files[activeFile];

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="min-h-10 px-3 text-xs text-muted-foreground hover:text-foreground"
        >
          <EyeIcon className="mr-1 size-3" />
          {t("view")}
        </Button>
      </DialogTrigger>
      <DialogContent className="top-0 left-0 flex h-dvh w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 p-0 sm:top-1/2 sm:left-1/2 sm:h-[min(88dvh,760px)] sm:w-[calc(100vw-2rem)] sm:max-w-6xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:border">
        <header className="shrink-0 border-b border-border/70 px-4 py-3 pr-14 sm:px-5 sm:py-4">
          <div className="flex min-w-0 items-center gap-2">
            <BookMarkedIcon className="size-4 shrink-0 text-muted-foreground" />
            <DialogTitle className="truncate text-base sm:text-lg">
              {skill.name}
            </DialogTitle>
            {isManual(skill) && (
              <Badge variant="secondary" className="shrink-0">
                {t("manual")}
              </Badge>
            )}
          </div>
          <DialogDescription className="mt-1 line-clamp-2 text-left text-xs sm:text-sm">
            {skill.description || t("noDescription")}
          </DialogDescription>
        </header>

        {/* Mobile file rail */}
        <div className="shrink-0 border-b border-border/70 bg-muted/25 px-3 py-2 md:hidden">
          <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {t("fileCount", { count: files.length })}
          </p>
          <ScrollArea className="w-full whitespace-nowrap">
            <div className="flex gap-2 pb-2">
              {files.map((file, i) => (
                <button
                  key={file.path}
                  type={BUTTON_TYPE}
                  className={`max-w-56 shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-[background-color,border-color,color,scale] duration-150 ease-out active:scale-[0.96] ${i === activeFile ? "border-primary/40 bg-primary/10 text-foreground" : "border-border/70 bg-background text-muted-foreground"}`}
                  onClick={() => setActiveFile(i)}
                >
                  <span className="block truncate font-mono">{file.path}</span>
                </button>
              ))}
            </div>
          </ScrollArea>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[17rem_minmax(0,1fr)]">
          {/* Desktop file list */}
          <aside className="hidden min-h-0 border-r border-border/70 bg-muted/20 md:block">
            <ScrollArea className="h-full">
              <div className="p-3">
                <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("fileCount", { count: files.length })}
                </p>
                {files.map((file, i) => (
                  <button
                    key={file.path}
                    type={BUTTON_TYPE}
                    className={`w-full rounded-lg px-2.5 py-2 text-left text-xs leading-snug transition-[background-color,box-shadow,color,scale] duration-150 ease-out active:scale-[0.96] ${i === activeFile ? "bg-background font-medium shadow-sm ring-1 ring-border/70" : "text-muted-foreground hover:bg-background/70 hover:text-foreground"}`}
                    onClick={() => setActiveFile(i)}
                  >
                    <span className="block truncate font-mono">
                      {file.path}
                    </span>
                  </button>
                ))}
              </div>
            </ScrollArea>
          </aside>

          <section className="flex min-h-0 min-w-0 flex-col">
            {currentFile ? (
              <>
                <div className="flex min-w-0 shrink-0 items-center gap-2 border-b border-border/70 px-4 py-2.5 sm:px-5">
                  <FileTextIcon className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate font-mono text-xs font-medium">
                    {currentFile.path}
                  </span>
                </div>
                <ScrollArea className="min-h-0 flex-1 bg-muted/20">
                  <div className="p-4 sm:p-5">
                    <pre className="whitespace-pre-wrap break-words font-sans text-xs leading-relaxed sm:text-sm">
                      {currentFile.content}
                    </pre>
                  </div>
                </ScrollArea>
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
                {t("noFiles")}
              </div>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Create/Edit Skill Form ─────────────────────────────────────────────

export type FileEntry = { path: string; content: string };
