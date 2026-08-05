"use client";

import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog,DialogContent,DialogDescription,DialogTitle,DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { useWorkspace } from "@/hooks/use-workspace";
import { FileTextIcon,Loader2Icon,PlusIcon,XIcon } from "lucide-react";
import { useState,type ReactNode } from "react";
import { toast } from "sonner";
import { AgentSkill,BUTTON_TYPE,FileEntry } from "./skill-manager.button-type";

export function SkillEditorDialog({
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
  const canSave = Boolean(name.trim()) && Boolean(description.trim()) && files.some((file) => file.content.trim());

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
    const nextFiles = [...files, { path: `extra-${files.length + 1}.md`, content: "" }];
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
      const res = await fetch(isEditing && skill ? `/api/workspace/skills/${skill.id}` : "/api/workspace/skills", {
        method: isEditing ? "PATCH" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          name: name.trim(),
          description: description.trim() || null,
          markdownFiles: files,
          isGlobal: canManageGlobal ? isGlobal : undefined,
        }),
      });
      if (!res.ok) {
        throw new Error((await res.json().catch(() => null))?.error || (isEditing ? t("updateFailed") : t("createFailed")));
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
      toast.error(error instanceof Error ? error.message : isEditing ? t("updateFailed") : t("createFailed"));
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
          <DialogTitle className="truncate text-base sm:text-lg">{isEditing ? t("editTitle") : t("createTitle")}</DialogTitle>
          <DialogDescription className="mt-1 line-clamp-2 text-left text-xs sm:text-sm">{isEditing ? t("editDescription") : t("createDescription")}</DialogDescription>
        </header>

        <div className="min-h-0 flex-1 overflow-hidden">
          <div className="flex h-full min-h-0 flex-col">
            <div className="shrink-0 space-y-3 border-b border-border/70 bg-background px-4 py-3 sm:px-5">
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
                <div className="grid gap-1.5">
                  <Label htmlFor={isEditing ? `skill-name-${skill?.id}` : "skill-name"}>{t("name")}</Label>
                  <Input id={isEditing ? `skill-name-${skill?.id}` : "skill-name"} value={name} onChange={(e) => setName(e.target.value)} placeholder="processing-pdfs" />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor={isEditing ? `skill-desc-${skill?.id}` : "skill-desc"}>{t("description")}</Label>
                  <Textarea id={isEditing ? `skill-desc-${skill?.id}` : "skill-desc"} value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("descriptionPlaceholder")} className="min-h-16 resize-none" />
                </div>
              </div>
              {canManageGlobal ? (
                <div className="flex items-start gap-3 rounded-lg border border-border/70 bg-muted/20 p-3">
                  <Checkbox id={isEditing ? `skill-global-${skill?.id}` : "skill-global"} checked={isGlobal} onCheckedChange={(checked) => setIsGlobal(checked === true)} />
                  <div className="grid gap-1.5 leading-none">
                    <Label htmlFor={isEditing ? `skill-global-${skill?.id}` : "skill-global"}>{t("globalLabel")}</Label>
                    <p className="text-xs text-muted-foreground">{t("globalHint")}</p>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[17rem_minmax(0,1fr)]">
              <div className="shrink-0 border-b border-border/70 bg-muted/25 px-3 py-2 md:hidden">
                <div className="mb-2 flex items-center justify-between gap-2 px-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{t("fileCount", { count: files.length })}</p>
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={addFile}>
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
                          i === activeFile ? "border-primary/40 bg-primary/10 text-foreground" : "border-border/70 bg-background text-muted-foreground"
                        }`}
                        onClick={() => setActiveFile(i)}
                      >
                        <span className="block truncate font-mono">{file.path || "untitled.md"}</span>
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              </div>

              <aside className="hidden min-h-0 border-r border-border/70 bg-muted/20 md:block">
                <div className="flex h-full min-h-0 flex-col">
                  <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/70 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{t("fileCount", { count: files.length })}</p>
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={addFile}>
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
                            i === activeFile ? "bg-background font-medium shadow-sm ring-1 ring-border/70" : "text-muted-foreground hover:bg-background/70 hover:text-foreground"
                          }`}
                          onClick={() => setActiveFile(i)}
                        >
                          <span className="block truncate font-mono">{file.path || "untitled.md"}</span>
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
                      <Input aria-label={t("filePath")} value={currentFile.path} onChange={(e) => updateFile(activeFile, "path", e.target.value)} placeholder="filename.md" className="h-8 min-w-0 font-mono text-xs" />
                      {files.length > 1 && (
                        <Button variant="ghost" size="icon" className="size-8 shrink-0" onClick={() => removeFile(activeFile)} aria-label={t("removeFile")}>
                          <XIcon className="size-3.5" />
                        </Button>
                      )}
                    </div>
                    <div className="min-h-0 flex-1 p-3 sm:p-4">
                      <Textarea
                        aria-label={t("fileContent")}
                        value={currentFile.content}
                        onChange={(e) => updateFile(activeFile, "content", e.target.value)}
                        placeholder={t("fileContentPlaceholder")}
                        className="h-full min-h-[42dvh] resize-none font-mono text-xs leading-relaxed md:min-h-0"
                      />
                    </div>
                  </>
                ) : (
                  <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">{t("noFiles")}</div>
                )}
              </section>
            </div>
          </div>
        </div>

        <footer className="flex shrink-0 flex-col-reverse gap-2 border-t border-border/70 bg-muted/30 p-3 sm:flex-row sm:justify-end sm:p-4">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            {t("cancel")}
          </Button>
          <Button onClick={() => void handleSave()} disabled={saving || !canSave}>
            {saving && <Loader2Icon className="mr-1 size-3 animate-spin" />}
            {isEditing ? t("saveChanges") : t("create")}
          </Button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
