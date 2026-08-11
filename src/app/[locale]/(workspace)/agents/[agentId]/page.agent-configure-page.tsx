"use client";

import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { type SyntheticEvent } from "react";
import { toast } from "sonner";

import { useWorkspaceShell } from "@/components/app-shell";
import { PageLoading } from "@/components/page-loading";
import { useWorkspace } from "@/hooks/use-workspace";

import { mergeAgentEditorState } from "./agent-editor-state";
import {
  buildAgentFormFromVersion,
  type AgentVersionPayload,
} from "./agent-form-from-version";
import { AgentConfigureLoadError } from "./page.agent-configure-load-error";
import { AgentConfigurePageView } from "./page.agent-configure-page.view";
import { agentSaveError } from "./page.build-tool-binding-map";
import {
  buildCapabilityBindings,
  buildEssentialPayload,
} from "./page.agent-save-payloads";
import { useAgentConfigurationData } from "./page.use-agent-configuration-data";
import type { Agent, DelegationConfig } from "./types";

export function useAgentConfigurePageController() {
  const params = useParams<{ agentId: string }>();
  const agentId = params.agentId;
  const router = useRouter();
  const { workspaceId, isLoading: workspaceLoading } = useWorkspace();
  const { permissions } = useWorkspaceShell();
  const t = useTranslations("agents");

  const {
    agent,
    setAgent,
    providers,
    models,
    builtinTools,
    mcpServers,
    mcpTools,
    customTools,
    knowledgeBases,
    skills,
    loading,
    loadError,
    saving,
    setSaving,
    activeTab,
    setActiveTab,
    form,
    setForm,
    builtinBindings,
    setBuiltinBindings,
    mcpBindings,
    setMcpBindings,
    customBindings,
    setCustomBindings,
    selectedKnowledgeIds,
    setSelectedKnowledgeIds,
    selectedSkillIds,
    setSelectedSkillIds,
    delegationConfig,
    setDelegationConfig,
    delegationCandidates,
    showDeleteDialog,
    setShowDeleteDialog,
    deleting,
    setDeleting,
    showCopyableError,
    retryLoad,
  } = useAgentConfigurationData(agentId, workspaceId);

  async function saveEssential(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!agent?.canEdit) {
      toast.error(t("configurePage.cloneToEditHint"));
      return;
    }
    if (!agentId || !workspaceId) return;
    setSaving(true);
    try {
      const availableToolNames = new Set([
        ...builtinTools
          .filter((tool) => builtinBindings[tool.id]?.enabled)
          .map((tool) => tool.name),
        ...mcpTools
          .filter((tool) => tool.enabled && mcpBindings[tool.id]?.enabled)
          .map((tool) => tool.name),
        ...customTools
          .filter((tool) => customBindings[tool.id]?.enabled)
          .map((tool) => tool.name),
      ]);
      const res = await fetch(`/api/workspace/agents/${agentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          ...buildEssentialPayload(form, agent, availableToolNames),
        }),
      });
      if (!res.ok) {
        throw new Error(
          await agentSaveError(
            res,
            "Unable to save agent",
            t("configurePage.conflictReload"),
          ),
        );
      }
      const data = (await res.json()) as {
        agent?: Agent;
        version?: AgentVersionPayload;
      };
      if (data.agent) {
        const updatedAgent = mergeAgentEditorState(agent, data.agent, {
          shareTargetEmail:
            data.agent.sharingMode === "specific_user"
              ? form.shareTargetEmail.trim()
              : null,
          access: {
            scope: form.accessScope,
            teamId: form.accessScope === "team" ? form.accessTeamId : null,
          },
        });
        setAgent(updatedAgent);
        if (data.version) {
          setForm(
            buildAgentFormFromVersion(
              updatedAgent,
              data.version,
              updatedAgent.shareTargetEmail,
            ),
          );
        } else {
          setForm((current) => ({
            ...current,
            originalSharingMode: data.agent!.sharingMode,
            shareTargetEmail: data.agent!.shareTargetEmail ?? "",
          }));
        }
      }
      toast.success(t("configurePage.saved"));
    } catch (error) {
      showCopyableError(error, "Unable to save agent");
      return;
    } finally {
      setSaving(false);
    }
  }

  async function saveCapabilities() {
    if (!agent?.canEdit) {
      toast.error(t("configurePage.cloneToEditHint"));
      return;
    }
    if (!agentId || !workspaceId) return;
    setSaving(true);
    try {
      const bindings = buildCapabilityBindings({
        builtinTools,
        builtinBindings,
        mcpTools,
        mcpServers,
        mcpBindings,
        customTools,
        customBindings,
      });
      const res = await fetch(`/api/workspace/agents/${agentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          baseVersionId: agent.activeVersionId ?? null,
          toolBindings: bindings,
          knowledgeBindings: selectedKnowledgeIds,
          skillBindings: selectedSkillIds,
        }),
      });
      if (!res.ok) {
        throw new Error(
          await agentSaveError(
            res,
            "Unable to save capabilities",
            t("configurePage.conflictReload"),
          ),
        );
      }
      const data = (await res.json()) as { agent?: Agent };
      if (data.agent) {
        setAgent((current) =>
          current ? mergeAgentEditorState(current, data.agent!) : current,
        );
      }
      toast.success(t("configurePage.capabilitiesSaved"));
    } catch (error) {
      showCopyableError(error, "Unable to save capabilities");
      return;
    } finally {
      setSaving(false);
    }
  }

  async function saveOrchestration() {
    if (!agent?.canEdit || agent.kind !== "orchestrator") return;
    if (!agentId || !workspaceId) return;
    setSaving(true);
    try {
      const response = await fetch(
        `/api/workspace/agents/${agentId}/delegations?workspaceId=${workspaceId}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            baseVersionId: agent.activeVersionId ?? null,
            policy: delegationConfig.policy,
            bindings: delegationConfig.bindings.map((binding) => ({
              childAgentId: binding.childAgentId,
              childAgentVersionId: binding.childAgentVersionId,
              instructions: binding.instructions?.trim() || null,
            })),
          }),
        },
      );
      if (!response.ok) {
        throw new Error(
          await agentSaveError(
            response,
            t("orchestration.saveFailed"),
            t("configurePage.conflictReload"),
          ),
        );
      }
      const payload = (await response.json()) as DelegationConfig;
      setDelegationConfig(payload);
      if (payload.version?.id) {
        setAgent((current) =>
          current
            ? { ...current, activeVersionId: payload.version!.id }
            : current,
        );
      }
      toast.success(t("orchestration.saved"));
    } catch (error) {
      showCopyableError(error, t("orchestration.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function handleLogoChange(logoUrl: string | null) {
    const canEditAgent = Boolean(agentId && workspaceId && agent?.canEdit);
    if (!canEditAgent) return;
    try {
      const res = await fetch(`/api/workspace/agents/${agentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          baseVersionId: agent?.activeVersionId ?? null,
          logoUrl,
        }),
      });
      if (!res.ok) {
        throw new Error(
          await agentSaveError(
            res,
            "Unable to update assistant logo",
            t("configurePage.conflictReload"),
          ),
        );
      }
      const data = (await res.json()) as { agent?: Agent };
      if (data.agent) {
        setAgent((current) =>
          current ? mergeAgentEditorState(current, data.agent!) : current,
        );
      }
      toast.success(
        logoUrl ? "Assistant logo updated" : "Assistant logo removed",
      );
    } catch (error) {
      showCopyableError(error, "Unable to update assistant logo");
      return;
    }
  }

  async function handleClone() {
    if (!agentId || !workspaceId) return;
    try {
      const res = await fetch(`/api/workspace/agents/${agentId}/clone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      });
      if (!res.ok) {
        throw new Error(
          (await res.json().catch(() => null))?.error ||
            t("list.toastCloneFailed"),
        );
      }
      const data = (await res.json()) as { agent?: Agent };
      toast.success(t("list.toastCloned"));
      if (data.agent?.id) {
        router.push(`/agents/${encodeURIComponent(data.agent.id)}`);
      }
    } catch (error) {
      showCopyableError(error, t("list.toastCloneFailed"));
      return;
    }
  }

  async function handleDelete() {
    const canDeleteAgent = Boolean(agentId && workspaceId && agent?.canEdit);
    if (!canDeleteAgent) return;
    setDeleting(true);
    try {
      const res = await fetch(
        `/api/workspace/agents/${agentId}?workspaceId=${workspaceId}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        throw new Error(
          (await res.json().catch(() => null))?.error ||
            t("configurePage.deleteFailed"),
        );
      }
      toast.success(t("configurePage.deleted"));
      router.push("/agents");
    } catch (error) {
      showCopyableError(error, t("configurePage.deleteFailed"));
      return;
    } finally {
      setDeleting(false);
      setShowDeleteDialog(false);
    }
  }

  if (workspaceLoading || !workspaceId || loading)
    return <PageLoading label={t("configure")} />;
  if (loadError || !agent)
    return <AgentConfigureLoadError message={loadError} onRetry={retryLoad} />;

  const enabledBuiltinCount = builtinTools.filter(
    (tool) => builtinBindings[tool.id]?.enabled,
  ).length;
  const enabledMcpCount = mcpTools.filter(
    (tool) => tool.enabled && mcpBindings[tool.id]?.enabled,
  ).length;
  const enabledCustomCount = customTools.filter(
    (tool) => customBindings[tool.id]?.enabled,
  ).length;
  const totalEnabledTools =
    enabledBuiltinCount + enabledMcpCount + enabledCustomCount;
  const capabilitiesCount =
    totalEnabledTools + selectedKnowledgeIds.length + selectedSkillIds.length;
  const delegationCount = delegationConfig.bindings.length;
  const canEdit = agent?.canEdit ?? false;
  const hasModel = Boolean(form.providerId && form.modelId);

  return {
    kind: "ready",
    activeTab,
    agentId,
    agent,
    builtinBindings,
    builtinTools,
    canEdit,
    capabilitiesCount,
    customBindings,
    customTools,
    delegationCandidates,
    delegationConfig,
    delegationCount,
    deleting,
    form,
    handleClone,
    handleDelete,
    handleLogoChange,
    hasModel,
    knowledgeBases,
    mcpBindings,
    mcpServers,
    mcpTools,
    models,
    permissions,
    providers,
    saveCapabilities,
    saveEssential,
    saveOrchestration,
    saving,
    selectedKnowledgeIds,
    selectedSkillIds,
    setActiveTab,
    setBuiltinBindings,
    setCustomBindings,
    setDelegationConfig,
    setForm,
    setMcpBindings,
    setSelectedKnowledgeIds,
    setSelectedSkillIds,
    setShowDeleteDialog,
    showDeleteDialog,
    skills,
    t,
    workspaceId,
  } as const;
}

export default function AgentConfigurePage(
  ...args: Parameters<typeof useAgentConfigurePageController>
) {
  const model = useAgentConfigurePageController(...args);
  return !("kind" in model) ? model : <AgentConfigurePageView model={model} />;
}
