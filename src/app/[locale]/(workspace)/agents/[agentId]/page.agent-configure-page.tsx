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
import { buildAgentFormFromVersion,type AgentVersionPayload } from "./agent-form-from-version";
import { AgentConfigureLoadError } from "./page.agent-configure-load-error";
import { AgentConfigurePageView } from "./page.agent-configure-page.view";
import { agentSaveError } from "./page.build-tool-binding-map";
import { useAgentConfigurationData } from "./page.use-agent-configuration-data";
import type { Agent,DelegationConfig } from "./types";
import { isMcpToolApprovalForced } from "./utils";

export function useAgentConfigurePageController() {
  const params = useParams<{ agentId: string }>();
  const agentId = params.agentId;
  const router = useRouter();
  const { workspaceId, isLoading: workspaceLoading } = useWorkspace();
  const { permissions } = useWorkspaceShell();
  const t = useTranslations("agents");

  const { agent, setAgent, providers, models, builtinTools, mcpServers, mcpTools, customTools, knowledgeBases, skills, loading, loadError, saving, setSaving, activeTab, setActiveTab, form, setForm, builtinBindings, setBuiltinBindings, mcpBindings, setMcpBindings, customBindings, selectedKnowledgeIds, setSelectedKnowledgeIds, selectedSkillIds, setSelectedSkillIds, delegationConfig, setDelegationConfig, delegationCandidates, showDeleteDialog, setShowDeleteDialog, deleting, setDeleting, showCopyableError, retryLoad } = useAgentConfigurationData(agentId, workspaceId);

  async function saveEssential(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!agent?.canEdit) {
      toast.error(t("configurePage.cloneToEditHint"));
      return;
    }
    if (!agentId || !workspaceId) return;
    setSaving(true);
    try {
      const generationSettings = {
        topK: Number(form.generationSettings.topK) || undefined,
        presencePenalty: form.generationSettings.presencePenalty === "" ? undefined : Number(form.generationSettings.presencePenalty),
        frequencyPenalty: form.generationSettings.frequencyPenalty === "" ? undefined : Number(form.generationSettings.frequencyPenalty),
        seed: form.generationSettings.seed === "" ? undefined : Number(form.generationSettings.seed),
        maxRetries: form.generationSettings.maxRetries === "" ? undefined : Number(form.generationSettings.maxRetries),
        stopSequences: form.generationSettings.stopSequences
          .split(/\n|,/)
          .map((sequence) => sequence.trim())
          .filter(Boolean),
      };
      const res = await fetch(`/api/workspace/agents/${agentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          baseVersionId: agent?.activeVersionId ?? null,
          name: form.name,
          slug: form.slug,
          description: form.description,
          systemPrompt: form.systemPrompt,
          providerId: form.providerId || undefined,
          modelId: form.modelId || undefined,
          promptSuggestions: form.promptSuggestions
            .split(/\n/)
            .map((suggestion) => suggestion.trim())
            .filter(Boolean),
          temperature: form.temperature,
          topP: form.topP,
          maxOutputTokens: Number(form.maxOutputTokens) || undefined,
          maxToolCalls: Number(form.maxToolCalls),
          toolChoice: form.toolChoice,
          generationSettings,
          responseFormat: form.responseFormat,
          memoryPolicy: form.memoryPolicy,
          guardrails: form.guardrails,
          approvalPolicy: form.approvalPolicy,
          ...(form.sharingMode !== form.originalSharingMode || form.shareTargetEmail.trim()
            ? {
                sharingMode: form.sharingMode,
                shareTargetEmail: form.sharingMode === "specific_user" ? form.shareTargetEmail.trim() : undefined,
              }
            : {}),
          ...(agent?.canAdminCurate
            ? {
                isGlobal: form.isGlobal,
                isRecommended: form.isRecommended,
                curationLabel: form.curationLabel,
              }
            : {}),
        }),
      });
      if (!res.ok) {
        throw new Error(await agentSaveError(res, "Unable to save agent", t("configurePage.conflictReload")));
      }
      const data = (await res.json()) as {
        agent?: Agent;
        version?: AgentVersionPayload;
      };
      if (data.agent) {
        const updatedAgent = mergeAgentEditorState(agent, data.agent, {
          shareTargetEmail: data.agent.sharingMode === "specific_user" ? form.shareTargetEmail.trim() : null,
        });
        setAgent(updatedAgent);
        if (data.version) {
          setForm(buildAgentFormFromVersion(updatedAgent, data.version, updatedAgent.shareTargetEmail));
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
      const bindings = [
        ...builtinTools
          .filter((tool) => builtinBindings[tool.id]?.enabled)
          .map((tool) => ({
            toolSource: "builtin" as const,
            toolId: tool.id,
            requireApproval: builtinBindings[tool.id]?.requireApproval,
          })),
        ...mcpTools
          .filter((tool) => tool.enabled && mcpBindings[tool.id]?.enabled)
          .map((tool) => ({
            toolSource: "mcp" as const,
            toolId: tool.id,
            mcpServerId: tool.mcpServerId,
            requireApproval: isMcpToolApprovalForced(tool, mcpServers) || mcpBindings[tool.id]?.requireApproval,
          })),
        ...customTools
          .filter((tool) => customBindings[tool.id]?.enabled)
          .map((tool) => ({
            toolSource: "custom" as const,
            toolId: tool.id,
            requireApproval: customBindings[tool.id]?.requireApproval ?? true,
          })),
      ];
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
        throw new Error(await agentSaveError(res, "Unable to save capabilities", t("configurePage.conflictReload")));
      }
      const data = (await res.json()) as { agent?: Agent };
      if (data.agent) {
        setAgent((current) => (current ? mergeAgentEditorState(current, data.agent!) : current));
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
      const response = await fetch(`/api/workspace/agents/${agentId}/delegations?workspaceId=${workspaceId}`, {
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
      });
      if (!response.ok) {
        throw new Error(await agentSaveError(response, t("orchestration.saveFailed"), t("configurePage.conflictReload")));
      }
      const payload = (await response.json()) as DelegationConfig;
      setDelegationConfig(payload);
      if (payload.version?.id) {
        setAgent((current) => (current ? { ...current, activeVersionId: payload.version!.id } : current));
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
        throw new Error(await agentSaveError(res, "Unable to update assistant logo", t("configurePage.conflictReload")));
      }
      const data = (await res.json()) as { agent?: Agent };
      if (data.agent) {
        setAgent((current) => (current ? mergeAgentEditorState(current, data.agent!) : current));
      }
      toast.success(logoUrl ? "Assistant logo updated" : "Assistant logo removed");
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
        throw new Error((await res.json().catch(() => null))?.error || t("list.toastCloneFailed"));
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
      const res = await fetch(`/api/workspace/agents/${agentId}?workspaceId=${workspaceId}`, { method: "DELETE" });
      if (!res.ok) {
        throw new Error((await res.json().catch(() => null))?.error || t("configurePage.deleteFailed"));
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

  if (workspaceLoading || !workspaceId || loading) return <PageLoading label={t("configure")} />;
  if (loadError || !agent) return <AgentConfigureLoadError message={loadError} onRetry={retryLoad} />;

  const enabledBuiltinCount = builtinTools.filter((tool) => builtinBindings[tool.id]?.enabled).length; const enabledMcpCount = mcpTools.filter((tool) => tool.enabled && mcpBindings[tool.id]?.enabled).length;
  const totalEnabledTools = enabledBuiltinCount + enabledMcpCount;
  const capabilitiesCount = totalEnabledTools + selectedKnowledgeIds.length + selectedSkillIds.length;
  const delegationCount = delegationConfig.bindings.length;
  const canEdit = agent?.canEdit ?? false;
  const hasModel = Boolean(form.providerId && form.modelId);

  return { kind: "ready", activeTab, agent, builtinBindings, builtinTools, canEdit, capabilitiesCount, delegationCandidates, delegationConfig, delegationCount, deleting, form, handleClone, handleDelete, handleLogoChange, hasModel, knowledgeBases, mcpBindings, mcpServers, mcpTools, models, permissions, providers, saveCapabilities, saveEssential, saveOrchestration, saving, selectedKnowledgeIds, selectedSkillIds, setActiveTab, setBuiltinBindings, setDelegationConfig, setForm, setMcpBindings, setSelectedKnowledgeIds, setSelectedSkillIds, setShowDeleteDialog, showDeleteDialog, skills, t } as const;
}

export default function AgentConfigurePage(...args: Parameters<typeof useAgentConfigurePageController>) { const model = useAgentConfigurePageController(...args); return !("kind" in model) ? model : <AgentConfigurePageView model={model} />; }
