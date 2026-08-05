"use client";

import { useTranslations } from "next-intl";

import { type ShareableResource } from "@/components/marketplace/resource-share-dialog";
import { useWorkspace } from "@/hooks/use-workspace";
import { fetchWorkspacePermissions } from "@/lib/api-client";
import { useCallback,useEffect,useMemo,useState } from "react";
import { toast } from "sonner";
import { AgentSkill,SKILLS_PAGE_SIZE,SkillPreview,isManual } from "./skill-manager.button-type";
import { SkillManagerView } from "./skill-manager.skill-manager.view";

export function useSkillManagerController() {
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

  return {
    kind: "ready",
    canManageTenantGlobals,
    deleteSkill,
    deletingSkillId,
    editorState,
    filteredSkills,
    installCommand,
    installGlobal,
    installOpen,
    installSkill,
    installing,
    loadError,
    loadSkills,
    loading,
    pendingDeleteSkill,
    preview,
    previewSkill,
    previewWorkspaceId,
    previewing,
    query,
    retryLoadSkills,
    scopeFilter,
    setEditorState,
    setInstallCommand,
    setInstallGlobal,
    setInstallOpen,
    setPendingDeleteSkill,
    setPreview,
    setPreviewToken,
    setPreviewWorkspaceId,
    setQuery,
    setScopeFilter,
    setShareResource,
    setSourceFilter,
    setVisibleCount,
    shareResource,
    skills,
    sourceFilter,
    t,
    tShare,
    visibleCount,
    visibleSkills,
    workspaceId,
  } as const;
}

export function SkillManager(...args: Parameters<typeof useSkillManagerController>) {
  const model = useSkillManagerController(...args);
  if (!("kind" in model)) return model;
  return <SkillManagerView model={model} />;
}
