"use client";

import { useTranslations } from "next-intl";

import { DestructiveConfirmationDialog } from "@/components/destructive-confirmation-dialog";
import { ResourceShareDialog,type ShareableResource } from "@/components/marketplace/resource-share-dialog";
import { ResourceProvenanceBadge } from "@/components/resource-provenance-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog,DialogContent,DialogDescription,DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu,DropdownMenuContent,DropdownMenuItem,DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select,SelectContent,SelectItem,SelectTrigger,SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useWorkspace } from "@/hooks/use-workspace";
import { fetchWorkspacePermissions } from "@/lib/api-client";
import { BookMarkedIcon,EyeIcon,Loader2Icon,MoreHorizontalIcon,PencilIcon,PlusIcon,SearchIcon,Share2,Trash2Icon } from "lucide-react";
import { useCallback,useEffect,useMemo,useState } from "react";
import { toast } from "sonner";
import { AgentSkill,BUTTON_TYPE,SKILLS_PAGE_SIZE,SkillDetailDialog,SkillPreview,fileCount,isManual } from "./skill-manager.button-type";
import { PreviewPanel } from "./skill-manager.preview-panel";
import { SkillEditorDialog } from "./skill-manager.skill-editor-dialog";

// ─── Main Skill Manager ────────────────────────────────────────────────

export function SkillManager() {
  const t = useTranslations("tools.skills");
  const tShare = useTranslations("marketplace.share");
  const { workspaceId } = useWorkspace();
  const [shareResource, setShareResource] = useState<ShareableResource | null>(null);
  const [skills, setSkills] = useState<AgentSkill[]>([]);
  const [query, setQuery] = useState("");
  const [scopeFilter, setScopeFilter] = useState<"all" | "organization" | "private">("all");
  const [sourceFilter, setSourceFilter] = useState<"all" | "imported" | "manual">("all");
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
  const [previewWorkspaceId, setPreviewWorkspaceId] = useState<string | null>(null);
  const [canManageTenantGlobals, setCanManageTenantGlobals] = useState(false);
  const [pendingDeleteSkill, setPendingDeleteSkill] = useState<AgentSkill | null>(null);
  const [deletingSkillId, setDeletingSkillId] = useState<string | null>(null);
  const filteredSkills = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return skills.filter((skill) => {
      const matchesQuery = !normalizedQuery || [skill.name, skill.description, skill.sourcePackage].filter(Boolean).some((value) => String(value).toLocaleLowerCase().includes(normalizedQuery));
      const matchesScope = scopeFilter === "all" || (scopeFilter === "organization" ? skill.isGlobal : !skill.isGlobal);
      const matchesSource = sourceFilter === "all" || (sourceFilter === "manual" ? isManual(skill) : !isManual(skill));
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
            toast.error(error instanceof Error ? error.message : t("loadFailed"));
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
    if (!workspaceId || !installCommand.trim() || !previewToken || previewWorkspaceId !== workspaceId) return;
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
        throw new Error((await res.json().catch(() => null))?.error || t("previewFailed"));
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
      const res = await fetch(`/api/workspace/skills/${skill.id}?workspaceId=${workspaceId}`, { method: "DELETE" });
      if (!res.ok) {
        throw new Error((await res.json().catch(() => null))?.error || t("deleteFailed"));
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
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
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
              <SelectTrigger className="h-10 w-full sm:w-40" aria-label={t("scopeFilter")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("scopeAll")}</SelectItem>
                <SelectItem value="organization">{t("scopeOrganization")}</SelectItem>
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
              <SelectTrigger className="h-10 w-full sm:w-40" aria-label={t("sourceFilter")}>
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
              <DropdownMenuItem onSelect={() => window.requestAnimationFrame(() => setInstallOpen(true))}>
                <BookMarkedIcon aria-hidden="true" />
                {t("installTitle")}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => window.requestAnimationFrame(() => setEditorState({}))}>
                <PencilIcon aria-hidden="true" />
                {t("createFromScratch")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <p className="mt-2 px-1 text-xs text-muted-foreground" aria-live="polite">
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
            <DialogDescription className="mt-1">{t("installDescription")}</DialogDescription>
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
              <label htmlFor="skill-install-global" className="flex items-start gap-3 rounded-xl border border-border/65 bg-muted/20 p-3">
                <Checkbox id="skill-install-global" checked={installGlobal} onCheckedChange={(checked) => setInstallGlobal(checked === true)} />
                <span className="grid gap-1">
                  <span className="text-sm font-medium">{t("installGlobalLabel")}</span>
                  <span className="text-xs text-muted-foreground">{t("installGlobalHint")}</span>
                </span>
              </label>
            ) : null}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs leading-5 text-muted-foreground">
                {t("explicitHintPrefix")} <code>--skill name</code> <code>owner/repo@skill</code>. {t("explicitHintSuffix")}
              </p>
              <Button type={BUTTON_TYPE} variant="outline" className="shrink-0" onClick={() => void previewSkill()} disabled={previewing || installing || !installCommand.trim()}>
                {previewing ? <Loader2Icon data-icon="inline-start" className="animate-spin" /> : <EyeIcon data-icon="inline-start" aria-hidden="true" />}
                {t("previewAction")}
              </Button>
            </div>
          </div>
          {preview && previewWorkspaceId === workspaceId ? <PreviewPanel preview={preview} onInstall={installSkill} installing={installing} /> : null}
        </DialogContent>
      </Dialog>

      {loading ? (
        <div className="overflow-hidden rounded-2xl border border-border/65 bg-card">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="flex items-center gap-3 border-b border-border/55 p-4 last:border-b-0">
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
        <div className="rounded-2xl border border-destructive/25 bg-destructive/5 p-6 text-center" role="alert">
          <p className="text-sm font-medium">{t("loadFailed")}</p>
          <p className="mx-auto mt-1 max-w-lg text-sm text-muted-foreground">{t("loadFailedDescription")}</p>
          <Button type="button" variant="outline" size="sm" className="mt-4" onClick={() => void retryLoadSkills()}>
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
          <div role="list" className="overflow-hidden rounded-2xl border border-border/65 bg-card/85 shadow-[var(--surface-shadow)]">
            {visibleSkills.map((skill) => (
              <article key={skill.id} role="listitem" className="group/skill flex flex-col gap-3 border-b border-border/55 p-3.5 last:border-b-0 sm:flex-row sm:items-center">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/8 text-primary">
                  <BookMarkedIcon className="size-4" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-sm font-semibold">{skill.name}</h3>
                    <ResourceProvenanceBadge provenance={skill.provenance} />
                  </div>
                  <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{skill.description || t("noDescription")}</p>
                </div>
                <div className="flex min-w-0 flex-wrap items-center gap-1.5 sm:max-w-[42%] sm:justify-end">
                  <Badge variant={skill.isGlobal ? "secondary" : "outline"}>{skill.isGlobal ? t("scopeOrganization") : t("scopePrivate")}</Badge>
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
                        <Button type={BUTTON_TYPE} variant="ghost" size="icon" className="size-10" aria-label={t("actionsAria", { name: skill.name })}>
                          <MoreHorizontalIcon aria-hidden="true" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => window.requestAnimationFrame(() => setEditorState({ skill }))}>
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
                        <DropdownMenuItem variant="destructive" onSelect={() => setPendingDeleteSkill(skill)}>
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
              <Button type={BUTTON_TYPE} variant="outline" onClick={() => setVisibleCount((current) => current + SKILLS_PAGE_SIZE)}>
                {t("showMore", {
                  count: Math.min(SKILLS_PAGE_SIZE, filteredSkills.length - visibleCount),
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
      <ResourceShareDialog resource={shareResource} workspaceId={workspaceId} open={shareResource !== null} onCloseAction={() => setShareResource(null)} />
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
