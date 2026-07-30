"use client";

import { useTranslations } from "next-intl";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  BookMarkedIcon,
  EyeIcon,
  FileTextIcon,
  Loader2Icon,
  MoreHorizontalIcon,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  ResourceShareDialog,
  type ShareableResource,
} from "@/components/marketplace/resource-share-dialog";
import {
  ResourceProvenanceBadge,
  type ResourceProvenance,
} from "@/components/resource-provenance-badge";
import { useWorkspace } from "@/hooks/use-workspace";
import { fetchWorkspacePermissions } from "@/lib/api-client";

const BUTTON_TYPE = "button";
const SKILLS_PAGE_SIZE = 24;

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
  open: controlledOpen,
  onOpenChange,
}: {
  skill?: AgentSkill;
  onSaved: () => void;
  trigger?: ReactNode;
  canManageGlobal: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
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
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
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
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
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
  const [query, setQuery] = useState("");
  const [scopeFilter, setScopeFilter] = useState<
    "all" | "organization" | "private"
  >("all");
  const [sourceFilter, setSourceFilter] = useState<
    "all" | "imported" | "manual"
  >("all");
  const [visibleCount, setVisibleCount] = useState(SKILLS_PAGE_SIZE);
  const [installOpen, setInstallOpen] = useState(false);
  const [editorState, setEditorState] = useState<{
    skill?: AgentSkill;
  } | null>(null);
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
  const filteredSkills = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return skills.filter((skill) => {
      const matchesQuery =
        !normalizedQuery ||
        [skill.name, skill.description, skill.sourcePackage]
          .filter(Boolean)
          .some((value) =>
            String(value).toLocaleLowerCase().includes(normalizedQuery),
          );
      const matchesScope =
        scopeFilter === "all" ||
        (scopeFilter === "organization" ? skill.isGlobal : !skill.isGlobal);
      const matchesSource =
        sourceFilter === "all" ||
        (sourceFilter === "manual" ? isManual(skill) : !isManual(skill));
      return matchesQuery && matchesScope && matchesSource;
    });
  }, [query, scopeFilter, skills, sourceFilter]);
  const visibleSkills = filteredSkills.slice(0, visibleCount);

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
      setInstallOpen(false);
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
    <div className="space-y-3">
      <div className="rounded-2xl border border-border/65 bg-card/85 p-3 shadow-[var(--surface-shadow)]">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <div className="relative min-w-0 flex-1">
            <SearchIcon
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setVisibleCount(SKILLS_PAGE_SIZE);
              }}
              placeholder={t("searchPlaceholder")}
              aria-label={t("searchPlaceholder")}
              className="h-10 pl-9"
            />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <Select
              value={scopeFilter}
              onValueChange={(value) => {
                setScopeFilter(value as "all" | "organization" | "private");
                setVisibleCount(SKILLS_PAGE_SIZE);
              }}
            >
              <SelectTrigger
                className="h-10 w-full sm:w-40"
                aria-label={t("scopeFilter")}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("scopeAll")}</SelectItem>
                <SelectItem value="organization">
                  {t("scopeOrganization")}
                </SelectItem>
                <SelectItem value="private">{t("scopePrivate")}</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={sourceFilter}
              onValueChange={(value) => {
                setSourceFilter(value as "all" | "imported" | "manual");
                setVisibleCount(SKILLS_PAGE_SIZE);
              }}
            >
              <SelectTrigger
                className="h-10 w-full sm:w-40"
                aria-label={t("sourceFilter")}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("sourceAll")}</SelectItem>
                <SelectItem value="imported">{t("sourceImported")}</SelectItem>
                <SelectItem value="manual">{t("sourceManual")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="h-10 shrink-0">
                <PlusIcon data-icon="inline-start" aria-hidden="true" />
                {t("addSkill")}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem
                onSelect={() =>
                  window.requestAnimationFrame(() => setInstallOpen(true))
                }
              >
                <BookMarkedIcon aria-hidden="true" />
                {t("installTitle")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() =>
                  window.requestAnimationFrame(() => setEditorState({}))
                }
              >
                <PencilIcon aria-hidden="true" />
                {t("createFromScratch")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <p
          className="mt-2 px-1 text-xs text-muted-foreground"
          aria-live="polite"
        >
          {t("resultsCount", {
            visible: Math.min(visibleCount, filteredSkills.length),
            total: filteredSkills.length,
          })}
        </p>
      </div>

      <Dialog open={installOpen} onOpenChange={setInstallOpen}>
        <DialogContent className="max-h-[min(88dvh,780px)] max-w-3xl overflow-y-auto">
          <div>
            <DialogTitle>{t("installTitle")}</DialogTitle>
            <DialogDescription className="mt-1">
              {t("installDescription")}
            </DialogDescription>
          </div>
          <div className="space-y-3">
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
              <label className="flex items-start gap-3 rounded-xl border border-border/65 bg-muted/20 p-3">
                <Checkbox
                  checked={installGlobal}
                  onCheckedChange={(checked) =>
                    setInstallGlobal(checked === true)
                  }
                />
                <span className="grid gap-1">
                  <span className="text-sm font-medium">
                    {t("installGlobalLabel")}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {t("installGlobalHint")}
                  </span>
                </span>
              </label>
            ) : null}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs leading-5 text-muted-foreground">
                {t("explicitHintPrefix")} <code>--skill name</code>{" "}
                <code>owner/repo@skill</code>. {t("explicitHintSuffix")}
              </p>
              <Button
                type={BUTTON_TYPE}
                variant="outline"
                className="shrink-0"
                onClick={() => void previewSkill()}
                disabled={previewing || installing || !installCommand.trim()}
              >
                {previewing ? (
                  <Loader2Icon
                    data-icon="inline-start"
                    className="animate-spin"
                  />
                ) : (
                  <EyeIcon data-icon="inline-start" aria-hidden="true" />
                )}
                {t("previewAction")}
              </Button>
            </div>
          </div>
          {preview && previewWorkspaceId === workspaceId ? (
            <PreviewPanel
              preview={preview}
              onInstall={installSkill}
              installing={installing}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      {loading ? (
        <div className="overflow-hidden rounded-2xl border border-border/65 bg-card">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="flex items-center gap-3 border-b border-border/55 p-4 last:border-b-0"
            >
              <Skeleton className="size-9 rounded-xl" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-3 w-40" />
                <Skeleton className="h-3 w-3/5" />
              </div>
              <Skeleton className="h-8 w-20 rounded-lg" />
            </div>
          ))}
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
      ) : filteredSkills.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/70 p-8 text-center text-sm text-muted-foreground">
          <p className="font-medium text-foreground">{t("noResultsTitle")}</p>
          <p className="mt-1">{t("noResultsDescription")}</p>
        </div>
      ) : (
        <>
          <div
            role="list"
            className="overflow-hidden rounded-2xl border border-border/65 bg-card/85 shadow-[var(--surface-shadow)]"
          >
            {visibleSkills.map((skill) => (
              <article
                key={skill.id}
                role="listitem"
                className="group/skill flex flex-col gap-3 border-b border-border/55 p-3.5 last:border-b-0 sm:flex-row sm:items-center"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/8 text-primary">
                  <BookMarkedIcon className="size-4" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-sm font-semibold">
                      {skill.name}
                    </h3>
                    <ResourceProvenanceBadge provenance={skill.provenance} />
                  </div>
                  <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                    {skill.description || t("noDescription")}
                  </p>
                </div>
                <div className="flex min-w-0 flex-wrap items-center gap-1.5 sm:max-w-[42%] sm:justify-end">
                  <Badge variant={skill.isGlobal ? "secondary" : "outline"}>
                    {skill.isGlobal
                      ? t("scopeOrganization")
                      : t("scopePrivate")}
                  </Badge>
                  <Badge variant="outline" className="max-w-44 truncate">
                    {skill.sourcePackage || t("manual")}
                  </Badge>
                  <span className="px-1 text-xs text-muted-foreground">
                    {t("fileCount", {
                      count: fileCount(skill.markdownFilesJson),
                    })}
                  </span>
                </div>
                <div className="flex shrink-0 items-center justify-end gap-1">
                  <SkillDetailDialog skill={skill} />
                  {skill.canEdit ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type={BUTTON_TYPE}
                          variant="ghost"
                          size="icon"
                          className="size-10"
                          aria-label={t("actionsAria", { name: skill.name })}
                        >
                          <MoreHorizontalIcon aria-hidden="true" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onSelect={() =>
                            window.requestAnimationFrame(() =>
                              setEditorState({ skill }),
                            )
                          }
                        >
                          <PencilIcon aria-hidden="true" />
                          {t("edit")}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() =>
                            setShareResource({
                              kind: "skill",
                              id: skill.id,
                              name: skill.name,
                              description: skill.description,
                            })
                          }
                        >
                          <Share2 aria-hidden="true" />
                          {tShare("action")}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant="destructive"
                          onSelect={() => setPendingDeleteSkill(skill)}
                        >
                          <Trash2Icon aria-hidden="true" />
                          {t("deleteConfirm")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
          {visibleCount < filteredSkills.length ? (
            <div className="flex justify-center pt-1">
              <Button
                type={BUTTON_TYPE}
                variant="outline"
                onClick={() =>
                  setVisibleCount((current) => current + SKILLS_PAGE_SIZE)
                }
              >
                {t("showMore", {
                  count: Math.min(
                    SKILLS_PAGE_SIZE,
                    filteredSkills.length - visibleCount,
                  ),
                })}
              </Button>
            </div>
          ) : null}
        </>
      )}

      {editorState ? (
        <SkillEditorDialog
          key={editorState.skill?.id ?? "create"}
          skill={editorState.skill}
          open
          onOpenChange={(open) => {
            if (!open) setEditorState(null);
          }}
          onSaved={loadSkills}
          canManageGlobal={canManageTenantGlobals}
        />
      ) : null}
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
