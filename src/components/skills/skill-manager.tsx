"use client";

import { useTranslations } from "next-intl";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  BookMarkedIcon,
  EyeIcon,
  FileTextIcon,
  Loader2Icon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  Share2,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";
import { DestructiveConfirmationDialog } from "@/components/destructive-confirmation-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  ResourceShareDialog,
  type ShareableResource,
} from "@/components/marketplace/resource-share-dialog";
import { useWorkspace } from "@/hooks/use-workspace";
import { fetchWorkspacePermissions } from "@/lib/api-client";

const BUTTON_TYPE = "button";

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
};

type SkillMarkdownFile = {
  path: string;
  content: string;
};

type SkillPreview = {
  name: string;
  description: string | null;
  markdownFiles: SkillMarkdownFile[];
  sourcePackage: string;
};

function fileCount(files: unknown): number {
  return Array.isArray(files) ? files.length : 0;
}

function isManual(skill: AgentSkill): boolean {
  return !skill.sourcePackage && !skill.installCommand;
}

// ─── Skill Detail Dialog ───────────────────────────────────────────────

function SkillDetailDialog({ skill }: { skill: AgentSkill }) {
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
          className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
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
                  className={`max-w-56 shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-[background-color,border-color,color,scale] duration-150 ease-out active:scale-[0.96] ${
                    i === activeFile
                      ? "border-primary/40 bg-primary/10 text-foreground"
                      : "border-border/70 bg-background text-muted-foreground"
                  }`}
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
                    className={`w-full rounded-lg px-2.5 py-2 text-left text-xs leading-snug transition-[background-color,box-shadow,color,scale] duration-150 ease-out active:scale-[0.96] ${
                      i === activeFile
                        ? "bg-background font-medium shadow-sm ring-1 ring-border/70"
                        : "text-muted-foreground hover:bg-background/70 hover:text-foreground"
                    }`}
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

type FileEntry = { path: string; content: string };

function SkillEditorDialog({
  skill,
  onSaved,
  trigger,
  canManageGlobal,
}: {
  skill?: AgentSkill;
  onSaved: () => void;
  trigger: ReactNode;
  canManageGlobal: boolean;
}) {
  const t = useTranslations("tools.skills");
  const { workspaceId } = useWorkspace();
  const isEditing = Boolean(skill);
  const initialFiles = skill?.markdownFilesJson?.length
    ? skill.markdownFilesJson.map((file) => ({
        path: file.path,
        content: file.content,
      }))
    : [{ path: "SKILL.md", content: "" }];
  const [name, setName] = useState(skill?.name ?? "");
  const [description, setDescription] = useState(skill?.description ?? "");
  const [files, setFiles] = useState<FileEntry[]>(initialFiles);
  const [activeFile, setActiveFile] = useState(0);
  const [isGlobal, setIsGlobal] = useState(skill?.isGlobal ?? false);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const currentFile = files[activeFile];
  const canSave =
    Boolean(name.trim()) &&
    Boolean(description.trim()) &&
    files.some((file) => file.content.trim());

  function resetForm() {
    setName(skill?.name ?? "");
    setDescription(skill?.description ?? "");
    setFiles(
      skill?.markdownFilesJson?.length
        ? skill.markdownFilesJson.map((file) => ({
            path: file.path,
            content: file.content,
          }))
        : [{ path: "SKILL.md", content: "" }],
    );
    setIsGlobal(skill?.isGlobal ?? false);
    setActiveFile(0);
  }

  function addFile() {
    const nextFiles = [
      ...files,
      { path: `extra-${files.length + 1}.md`, content: "" },
    ];
    setFiles(nextFiles);
    setActiveFile(nextFiles.length - 1);
  }

  function removeFile(index: number) {
    if (files.length <= 1) return;
    const nextFiles = files.filter((_, i) => i !== index);
    setFiles(nextFiles);
    setActiveFile(Math.min(activeFile, nextFiles.length - 1));
  }

  function updateFile(index: number, field: "path" | "content", value: string) {
    const next = [...files];
    next[index] = { ...next[index], [field]: value };
    setFiles(next);
  }

  async function handleSave() {
    if (!workspaceId || !canSave) return;
    setSaving(true);
    try {
      const res = await fetch(
        isEditing && skill
          ? `/api/workspace/skills/${skill.id}`
          : "/api/workspace/skills",
        {
          method: isEditing ? "PATCH" : "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspaceId,
            name: name.trim(),
            description: description.trim() || null,
            markdownFiles: files,
            isGlobal: canManageGlobal ? isGlobal : undefined,
          }),
        },
      );
      if (!res.ok) {
        throw new Error(
          (await res.json().catch(() => null))?.error ||
            (isEditing ? t("updateFailed") : t("createFailed")),
        );
      }
      if (!isEditing) {
        setName("");
        setDescription("");
        setFiles([{ path: "SKILL.md", content: "" }]);
        setIsGlobal(false);
        setActiveFile(0);
      }
      setOpen(false);
      toast.success(isEditing ? t("updated") : t("created"));
      onSaved();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : isEditing
            ? t("updateFailed")
            : t("createFailed"),
      );
      return;
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) resetForm();
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="top-0 left-0 flex h-dvh w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 p-0 sm:top-1/2 sm:left-1/2 sm:h-[min(90dvh,800px)] sm:w-[calc(100vw-2rem)] sm:max-w-5xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:border">
        <header className="shrink-0 border-b border-border/70 px-4 py-3 pr-14 sm:px-5 sm:py-4">
          <DialogTitle className="truncate text-base sm:text-lg">
            {isEditing ? t("editTitle") : t("createTitle")}
          </DialogTitle>
          <DialogDescription className="mt-1 line-clamp-2 text-left text-xs sm:text-sm">
            {isEditing ? t("editDescription") : t("createDescription")}
          </DialogDescription>
        </header>

        <div className="min-h-0 flex-1 overflow-hidden">
          <div className="flex h-full min-h-0 flex-col">
            <div className="shrink-0 space-y-3 border-b border-border/70 bg-background px-4 py-3 sm:px-5">
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
                <div className="grid gap-1.5">
                  <Label
                    htmlFor={
                      isEditing ? `skill-name-${skill?.id}` : "skill-name"
                    }
                  >
                    {t("name")}
                  </Label>
                  <Input
                    id={isEditing ? `skill-name-${skill?.id}` : "skill-name"}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="processing-pdfs"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label
                    htmlFor={
                      isEditing ? `skill-desc-${skill?.id}` : "skill-desc"
                    }
                  >
                    {t("description")}
                  </Label>
                  <Textarea
                    id={isEditing ? `skill-desc-${skill?.id}` : "skill-desc"}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder={t("descriptionPlaceholder")}
                    className="min-h-16 resize-none"
                  />
                </div>
              </div>
              {canManageGlobal ? (
                <div className="flex items-start gap-3 rounded-lg border border-border/70 bg-muted/20 p-3">
                  <Checkbox
                    id={
                      isEditing ? `skill-global-${skill?.id}` : "skill-global"
                    }
                    checked={isGlobal}
                    onCheckedChange={(checked) => setIsGlobal(checked === true)}
                  />
                  <div className="grid gap-1.5 leading-none">
                    <Label
                      htmlFor={
                        isEditing ? `skill-global-${skill?.id}` : "skill-global"
                      }
                    >
                      {t("globalLabel")}
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      {t("globalHint")}
                    </p>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[17rem_minmax(0,1fr)]">
              <div className="shrink-0 border-b border-border/70 bg-muted/25 px-3 py-2 md:hidden">
                <div className="mb-2 flex items-center justify-between gap-2 px-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {t("fileCount", { count: files.length })}
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={addFile}
                  >
                    <PlusIcon className="mr-1 size-3" />
                    {t("addFile")}
                  </Button>
                </div>
                <ScrollArea className="w-full whitespace-nowrap">
                  <div className="flex gap-2 pb-2">
                    {files.map((file, i) => (
                      <button
                        key={i}
                        type={BUTTON_TYPE}
                        className={`max-w-56 shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-[background-color,border-color,color,scale] duration-150 ease-out active:scale-[0.96] ${
                          i === activeFile
                            ? "border-primary/40 bg-primary/10 text-foreground"
                            : "border-border/70 bg-background text-muted-foreground"
                        }`}
                        onClick={() => setActiveFile(i)}
                      >
                        <span className="block truncate font-mono">
                          {file.path || "untitled.md"}
                        </span>
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              </div>

              <aside className="hidden min-h-0 border-r border-border/70 bg-muted/20 md:block">
                <div className="flex h-full min-h-0 flex-col">
                  <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/70 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {t("fileCount", { count: files.length })}
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={addFile}
                    >
                      <PlusIcon className="mr-1 size-3" />
                      {t("addFile")}
                    </Button>
                  </div>
                  <ScrollArea className="min-h-0 flex-1">
                    <div className="space-y-1 p-3">
                      {files.map((file, i) => (
                        <button
                          key={i}
                          type={BUTTON_TYPE}
                          className={`w-full rounded-lg px-2.5 py-2 text-left text-xs leading-snug transition-[background-color,box-shadow,color,scale] duration-150 ease-out active:scale-[0.96] ${
                            i === activeFile
                              ? "bg-background font-medium shadow-sm ring-1 ring-border/70"
                              : "text-muted-foreground hover:bg-background/70 hover:text-foreground"
                          }`}
                          onClick={() => setActiveFile(i)}
                        >
                          <span className="block truncate font-mono">
                            {file.path || "untitled.md"}
                          </span>
                        </button>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              </aside>

              <section className="flex min-h-0 min-w-0 flex-col bg-background">
                {currentFile ? (
                  <>
                    <div className="flex shrink-0 items-center gap-2 border-b border-border/70 px-4 py-2.5 sm:px-5">
                      <FileTextIcon className="size-3.5 shrink-0 text-muted-foreground" />
                      <Input
                        aria-label={t("filePath")}
                        value={currentFile.path}
                        onChange={(e) =>
                          updateFile(activeFile, "path", e.target.value)
                        }
                        placeholder="filename.md"
                        className="h-8 min-w-0 font-mono text-xs"
                      />
                      {files.length > 1 && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 shrink-0"
                          onClick={() => removeFile(activeFile)}
                          aria-label={t("removeFile")}
                        >
                          <XIcon className="size-3.5" />
                        </Button>
                      )}
                    </div>
                    <div className="min-h-0 flex-1 p-3 sm:p-4">
                      <Textarea
                        aria-label={t("fileContent")}
                        value={currentFile.content}
                        onChange={(e) =>
                          updateFile(activeFile, "content", e.target.value)
                        }
                        placeholder={t("fileContentPlaceholder")}
                        className="h-full min-h-[42dvh] resize-none font-mono text-xs leading-relaxed md:min-h-0"
                      />
                    </div>
                  </>
                ) : (
                  <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
                    {t("noFiles")}
                  </div>
                )}
              </section>
            </div>
          </div>
        </div>

        <footer className="flex shrink-0 flex-col-reverse gap-2 border-t border-border/70 bg-muted/30 p-3 sm:flex-row sm:justify-end sm:p-4">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            {t("cancel")}
          </Button>
          <Button
            onClick={() => void handleSave()}
            disabled={saving || !canSave}
          >
            {saving && <Loader2Icon className="mr-1 size-3 animate-spin" />}
            {isEditing ? t("saveChanges") : t("create")}
          </Button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}

// ─── Preview Panel ─────────────────────────────────────────────────────

function PreviewPanel({
  preview,
  onInstall,
  installing,
}: {
  preview: SkillPreview[];
  onInstall: () => void;
  installing: boolean;
}) {
  const t = useTranslations("tools.skills");
  const [expandedSkill, setExpandedSkill] = useState(0);
  const [expandedFile, setExpandedFile] = useState<string | null>(null);
  const skill = preview[expandedSkill];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <SearchIcon className="size-4" />
          {t("previewTitle", { count: preview.length })}
        </CardTitle>
        <CardDescription>{t("previewDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {preview.length > 1 && (
          <Tabs
            value={String(expandedSkill)}
            onValueChange={(v) => {
              setExpandedSkill(Number(v));
              setExpandedFile(null);
            }}
          >
            <TabsList>
              {preview.map((s, i) => (
                <TabsTrigger key={i} value={String(i)}>
                  {s.name}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        )}

        {skill && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{skill.sourcePackage}</Badge>
              <Badge variant="secondary">
                {t("fileCount", { count: skill.markdownFiles.length })}
              </Badge>
            </div>

            {skill.description && (
              <p className="text-sm text-muted-foreground">
                {skill.description}
              </p>
            )}

            <details
              open
              onToggle={(e) => {
                if (!e.currentTarget.open) setExpandedFile(null);
              }}
            >
              <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
                {t("filesIncluded")}
              </summary>
              <div className="mt-2 space-y-1">
                {skill.markdownFiles.map((file) => (
                  <div key={file.path} className="group">
                    <button
                      type={BUTTON_TYPE}
                      className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-muted"
                      onClick={() =>
                        setExpandedFile(
                          expandedFile === file.path ? null : file.path,
                        )
                      }
                    >
                      <FileTextIcon className="size-3 shrink-0 text-muted-foreground" />
                      <span className="truncate font-mono">{file.path}</span>
                      <span className="ml-auto text-[10px] text-muted-foreground">
                        {t("byteCount", {
                          count: new Blob([file.content]).size,
                        })}
                      </span>
                    </button>
                    {expandedFile === file.path && (
                      <div className="mt-1 rounded border bg-muted/30 p-3">
                        <ScrollArea className="max-h-60">
                          <pre className="whitespace-pre-wrap text-[11px] leading-relaxed font-sans">
                            {file.content}
                          </pre>
                        </ScrollArea>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </details>

            <div className="flex justify-end">
              <Button onClick={() => void onInstall()} disabled={installing}>
                {installing ? (
                  <Loader2Icon className="mr-1 size-3 animate-spin" />
                ) : (
                  <BookMarkedIcon className="mr-1 size-3.5" />
                )}
                {t("installReviewed", { count: preview.length })}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main Skill Manager ────────────────────────────────────────────────

export function SkillManager() {
  const t = useTranslations("tools.skills");
  const tShare = useTranslations("marketplace.share");
  const { workspaceId } = useWorkspace();
  const [shareResource, setShareResource] = useState<ShareableResource | null>(
    null,
  );
  const [skills, setSkills] = useState<AgentSkill[]>([]);
  const [installCommand, setInstallCommand] = useState("");
  const [installGlobal, setInstallGlobal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState<SkillPreview[] | null>(null);
  const [previewToken, setPreviewToken] = useState<string | null>(null);
  const [previewWorkspaceId, setPreviewWorkspaceId] = useState<string | null>(
    null,
  );
  const [canManageTenantGlobals, setCanManageTenantGlobals] = useState(false);
  const [pendingDeleteSkill, setPendingDeleteSkill] =
    useState<AgentSkill | null>(null);
  const [deletingSkillId, setDeletingSkillId] = useState<string | null>(null);

  const loadSkills = useCallback(async () => {
    if (!workspaceId) return;
    const permissions = await fetchWorkspacePermissions(workspaceId);
    setCanManageTenantGlobals(permissions.canManageTenantGlobals);
    const res = await fetch(`/api/workspace/skills?workspaceId=${workspaceId}`);
    if (!res.ok) throw new Error(t("loadFailed"));
    setSkills((await res.json()) as AgentSkill[]);
    setLoadError(false);
  }, [workspaceId, t]);

  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;
    const timeout = window.setTimeout(() => {
      void loadSkills()
        .catch((error) => {
          if (!cancelled) {
            setLoadError(true);
            toast.error(
              error instanceof Error ? error.message : t("loadFailed"),
            );
          }
          return;
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [workspaceId, loadSkills, t]);

  async function retryLoadSkills() {
    setLoading(true);
    setLoadError(false);
    try {
      await loadSkills();
    } catch (error) {
      setLoadError(true);
      toast.error(error instanceof Error ? error.message : t("loadFailed"));
    } finally {
      setLoading(false);
    }
  }

  async function installSkill() {
    if (
      !workspaceId ||
      !installCommand.trim() ||
      !previewToken ||
      previewWorkspaceId !== workspaceId
    )
      return;
    setInstalling(true);
    try {
      const res = await fetch("/api/workspace/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          installCommand,
          previewToken,
          isGlobal: canManageTenantGlobals ? installGlobal : undefined,
        }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as {
          error?: string;
          code?: string;
        } | null;
        if (payload?.code === "SKILL_PREVIEW_STALE") {
          setPreview(null);
          setPreviewToken(null);
          setPreviewWorkspaceId(null);
        }
        throw new Error(payload?.error || t("installFailed"));
      }
      setInstallCommand("");
      setInstallGlobal(false);
      setPreview(null);
      setPreviewToken(null);
      setPreviewWorkspaceId(null);
      toast.success(t("installed"));
      await loadSkills();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("installFailed"));
      return;
    } finally {
      setInstalling(false);
    }
  }

  async function previewSkill() {
    if (!installCommand.trim()) return;
    setPreviewing(true);
    setPreview(null);
    setPreviewToken(null);
    setPreviewWorkspaceId(null);
    try {
      if (!workspaceId) return;
      const res = await fetch("/api/workspace/skills/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, installCommand }),
      });
      if (!res.ok) {
        throw new Error(
          (await res.json().catch(() => null))?.error || t("previewFailed"),
        );
      }
      const data = (await res.json()) as {
        skills: SkillPreview[];
        previewToken: string;
      };
      setPreview(data.skills);
      setPreviewToken(data.previewToken);
      setPreviewWorkspaceId(workspaceId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("previewFailed"));
      return;
    } finally {
      setPreviewing(false);
    }
  }

  async function deleteSkill(skill: AgentSkill) {
    if (!workspaceId || deletingSkillId) return;
    setDeletingSkillId(skill.id);
    try {
      const res = await fetch(
        `/api/workspace/skills/${skill.id}?workspaceId=${workspaceId}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        throw new Error(
          (await res.json().catch(() => null))?.error || t("deleteFailed"),
        );
      }
      setPendingDeleteSkill(null);
      toast.success(t("deleted"));
      await loadSkills();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("deleteFailed"));
    } finally {
      setDeletingSkillId(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* Install section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookMarkedIcon className="size-5" aria-hidden="true" />
            {t("installTitle")}
          </CardTitle>
          <CardDescription>{t("installDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            aria-label={t("installCommand")}
            value={installCommand}
            onChange={(event) => {
              setInstallCommand(event.target.value);
              setPreview(null);
              setPreviewToken(null);
              setPreviewWorkspaceId(null);
            }}
            placeholder="npx skills add anthropics/skills --skill skill-creator"
            className="min-h-20 font-mono text-sm"
          />
          {canManageTenantGlobals ? (
            <div className="flex items-start gap-3 rounded-lg border border-border/70 bg-muted/20 p-3">
              <Checkbox
                id="skill-install-global"
                checked={installGlobal}
                onCheckedChange={(checked) =>
                  setInstallGlobal(checked === true)
                }
              />
              <div className="grid gap-1.5 leading-none">
                <Label htmlFor="skill-install-global">
                  {t("installGlobalLabel")}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {t("installGlobalHint")}
                </p>
              </div>
            </div>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              {t("explicitHintPrefix")} <code>--skill name</code>{" "}
              <code>owner/repo@skill</code>. {t("explicitHintSuffix")}
            </p>
            <div className="flex gap-2">
              <Button
                type={BUTTON_TYPE}
                variant="outline"
                size="sm"
                onClick={() => void previewSkill()}
                disabled={previewing || installing || !installCommand.trim()}
              >
                {previewing ? (
                  <Loader2Icon
                    className="mr-1 size-3 animate-spin"
                    data-icon="inline-start"
                  />
                ) : (
                  <EyeIcon className="mr-1 size-3.5" />
                )}
                {t("previewAction")}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Preview panel */}
      {preview && previewWorkspaceId === workspaceId && (
        <PreviewPanel
          preview={preview}
          onInstall={installSkill}
          installing={installing}
        />
      )}

      {/* Installed skills */}
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium">
          {t("installedTitle", { count: skills.length })}
        </h3>
        <SkillEditorDialog
          onSaved={loadSkills}
          canManageGlobal={canManageTenantGlobals}
          trigger={
            <Button variant="outline" size="sm" className="shrink-0">
              <PlusIcon className="mr-1 size-3.5" />
              {t("createFromScratch")}
            </Button>
          }
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2Icon className="animate-spin" />
        </div>
      ) : loadError ? (
        <div
          className="rounded-2xl border border-destructive/25 bg-destructive/5 p-6 text-center"
          role="alert"
        >
          <p className="text-sm font-medium">{t("loadFailed")}</p>
          <p className="mx-auto mt-1 max-w-lg text-sm text-muted-foreground">
            {t("loadFailedDescription")}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => void retryLoadSkills()}
          >
            {t("retry")}
          </Button>
        </div>
      ) : skills.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/70 p-8 text-center text-sm text-muted-foreground">
          <p className="font-medium text-foreground">{t("emptyTitle")}</p>
          <p className="mt-1">{t("emptyDescription")}</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {skills.map((skill) => (
            <Card key={skill.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <CardTitle className="truncate text-base">
                      {skill.name}
                    </CardTitle>
                    <CardDescription className="line-clamp-2 mt-1">
                      {skill.description || t("noDescription")}
                    </CardDescription>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <SkillDetailDialog skill={skill} />
                    <SkillEditorDialog
                      skill={skill}
                      onSaved={loadSkills}
                      canManageGlobal={canManageTenantGlobals}
                      trigger={
                        <Button
                          type={BUTTON_TYPE}
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          aria-label={t("editAria", { name: skill.name })}
                          disabled={!skill.canEdit}
                        >
                          <PencilIcon className="size-3.5" aria-hidden="true" />
                        </Button>
                      }
                    />
                    <Button
                      type={BUTTON_TYPE}
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      aria-label={`${tShare("action")} ${skill.name}`}
                      disabled={!skill.canEdit}
                      onClick={() =>
                        setShareResource({
                          kind: "skill",
                          id: skill.id,
                          name: skill.name,
                          description: skill.description,
                        })
                      }
                    >
                      <Share2 className="size-3.5" aria-hidden="true" />
                    </Button>
                    <Button
                      type={BUTTON_TYPE}
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      disabled={!skill.canEdit}
                      aria-label={t("deleteAria", { name: skill.name })}
                      onClick={() => setPendingDeleteSkill(skill)}
                    >
                      <Trash2Icon className="size-3.5" aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <Badge variant={skill.isGlobal ? "secondary" : "outline"}>
                  {skill.isGlobal ? t("scopeOrganization") : t("scopePrivate")}
                </Badge>
                {skill.sourcePackage ? (
                  <Badge variant="outline">{skill.sourcePackage}</Badge>
                ) : (
                  <Badge variant="secondary">{t("manual")}</Badge>
                )}
                <Badge variant="outline">
                  {t("fileCount", {
                    count: fileCount(skill.markdownFilesJson),
                  })}
                </Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ResourceShareDialog
        resource={shareResource}
        workspaceId={workspaceId}
        open={shareResource !== null}
        onCloseAction={() => setShareResource(null)}
      />
      <DestructiveConfirmationDialog
        open={pendingDeleteSkill !== null}
        title={t("deleteTitle")}
        description={t("deleteDescription", {
          name: pendingDeleteSkill?.name ?? "",
        })}
        cancelLabel={t("deleteCancel")}
        confirmLabel={deletingSkillId ? t("deleting") : t("deleteConfirm")}
        busy={deletingSkillId !== null}
        onOpenChange={(open) => {
          if (!open && !deletingSkillId) setPendingDeleteSkill(null);
        }}
        onConfirm={() => {
          if (pendingDeleteSkill) void deleteSkill(pendingDeleteSkill);
        }}
      />
    </div>
  );
}
