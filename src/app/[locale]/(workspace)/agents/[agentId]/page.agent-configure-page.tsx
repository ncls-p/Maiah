"use client";

import { Link,useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { useCallback,useEffect,useState,type SyntheticEvent } from "react";
import { toast } from "sonner";

import { useWorkspaceShell } from "@/components/app-shell";
import { PageLoading } from "@/components/page-loading";
import { Button } from "@/components/ui/button";
import { WorkspacePage } from "@/components/workspace-page";
import { useWorkspace } from "@/hooks/use-workspace";

import { mergeAgentEditorState } from "./agent-editor-state";
import { buildAgentFormFromVersion,type AgentVersionPayload } from "./agent-form-from-version";
import { AgentConfigurePageView } from "./page.agent-configure-page.view";
import { agentSaveError,buildToolBindingMap,defaultDelegationConfig } from "./page.build-tool-binding-map";
import type { Agent,AgentForm,AgentSkill,BuiltinTool,CustomTool,DelegationConfig,KnowledgeBase,KnowledgeBinding,McpServer,McpTool,Model,Provider,SkillBinding,ToolBinding,ToolBindingState } from "./types";
import { createEmptyForm } from "./types";
import { isMcpToolApprovalForced } from "./utils";

export function useAgentConfigurePageController() {
  const params = useParams<{ agentId: string }>();
  const agentId = params.agentId;
  const router = useRouter();
  const { workspaceId, isLoading: workspaceLoading } = useWorkspace();
  const { permissions } = useWorkspaceShell();
  const t = useTranslations("agents");

  const [agent, setAgent] = useState<Agent | null>(null);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [builtinTools, setBuiltinTools] = useState<BuiltinTool[]>([]);
  const [mcpServers, setMcpServers] = useState<McpServer[]>([]);
  const [mcpTools, setMcpTools] = useState<McpTool[]>([]);
  const [customTools, setCustomTools] = useState<CustomTool[]>([]);
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [skills, setSkills] = useState<AgentSkill[]>([]);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("essential");

  const [form, setForm] = useState<AgentForm>(createEmptyForm);
  const [builtinBindings, setBuiltinBindings] = useState<ToolBindingState>({});
  const [mcpBindings, setMcpBindings] = useState<ToolBindingState>({});
  const [customBindings, setCustomBindings] = useState<ToolBindingState>({});
  const [selectedKnowledgeIds, setSelectedKnowledgeIds] = useState<string[]>([]);
  const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>([]);

  function showCopyableError(error: unknown, fallback: string) {
    const message = error instanceof Error ? error.message : fallback;
    toast.error(message, {
      duration: 12_000,
      action: {
        label: t("configurePage.copyError"),
        onClick: () => {
          void navigator.clipboard
            .writeText(message)
            .then(() => toast.success(t("configurePage.errorCopied")))
            .catch(() => toast.error(t("configurePage.errorCopyFailed")));
        },
      },
    });
  }
  const [delegationConfig, setDelegationConfig] = useState<DelegationConfig>(defaultDelegationConfig);
  const [delegationCandidates, setDelegationCandidates] = useState<Agent[]>([]);

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const loadData = useCallback(async () => {
    if (!agentId || !workspaceId) return;

    const agentRes = await fetch(`/api/workspace/agents/${agentId}?workspaceId=${workspaceId}`);
    if (!agentRes.ok) {
      throw new Error("Unable to load agent settings");
    }

    const nextAgent = (await agentRes.json()) as Agent;

    let activeVersion: AgentVersionPayload | null = null;
    if (nextAgent.activeVersionId) {
      const versionRes = await fetch(`/api/workspace/agents/${agentId}/versions?workspaceId=${workspaceId}&versionId=${nextAgent.activeVersionId}`);
      if (versionRes.ok) {
        activeVersion = (await versionRes.json()) as AgentVersionPayload;
      }
    }
    if (!activeVersion) {
      const versionsRes = await fetch(`/api/workspace/agents/${agentId}/versions?workspaceId=${workspaceId}`);
      if (versionsRes.ok) {
        const versions = (await versionsRes.json()) as AgentVersionPayload[];
        if (Array.isArray(versions)) {
          activeVersion = versions.find((version) => version.isActive) ?? versions[0] ?? null;
        }
      }
    }

    setAgent(nextAgent);
    setForm(buildAgentFormFromVersion(nextAgent, activeVersion, nextAgent.shareTargetEmail));

    if (nextAgent.kind === "orchestrator") {
      const [delegationResponse, agentsResponse] = await Promise.all([fetch(`/api/workspace/agents/${agentId}/delegations?workspaceId=${workspaceId}`), fetch(`/api/workspace/agents?workspaceId=${workspaceId}&includeModelMeta=false`)]);
      if (!delegationResponse.ok || !agentsResponse.ok) {
        throw new Error("Unable to load orchestrator settings");
      }
      const delegationPayload = (await delegationResponse.json()) as Omit<DelegationConfig, "policy"> & { policy: DelegationConfig["policy"] | null };
      const agentsPayload = (await agentsResponse.json()) as Agent[] | { agents?: Agent[] };
      setDelegationConfig({
        ...defaultDelegationConfig,
        ...delegationPayload,
        policy: delegationPayload.policy ?? defaultDelegationConfig.policy,
      });
      setDelegationCandidates(Array.isArray(agentsPayload) ? agentsPayload : (agentsPayload.agents ?? []));
    } else {
      setDelegationConfig(defaultDelegationConfig);
      setDelegationCandidates([]);
    }

    if (!nextAgent.canEdit) {
      const providerCatalogRes = await fetch(`/api/workspace/providers?workspaceId=${workspaceId}&includeModels=true`);
      if (!providerCatalogRes.ok) {
        throw new Error("Unable to load agent model settings");
      }
      const providerCatalog = (await providerCatalogRes.json()) as {
        providers: Provider[];
        models: Model[];
      };
      setProviders(providerCatalog.providers);
      setModels(providerCatalog.models);
      setBuiltinTools([]);
      setMcpServers([]);
      setMcpTools([]);
      setCustomTools([]);
      setKnowledgeBases([]);
      setSkills([]);
      setBuiltinBindings({});
      setMcpBindings({});
      setCustomBindings({});
      setSelectedKnowledgeIds([]);
      setSelectedSkillIds([]);
      return;
    }

    const [providersRes, toolsRes, mcpRes, customToolsRes, kbRes, skillsRes, bindingsRes, knowledgeBindingsRes, skillBindingsRes] = await Promise.all([fetch(`/api/workspace/providers?workspaceId=${workspaceId}&includeModels=true`), fetch(`/api/workspace/tools?workspaceId=${workspaceId}`), fetch(`/api/workspace/mcp-servers?workspaceId=${workspaceId}`), fetch(`/api/workspace/custom-tools?workspaceId=${workspaceId}`), fetch(`/api/workspace/knowledge-bases?workspaceId=${workspaceId}`), fetch(`/api/workspace/skills?workspaceId=${workspaceId}`), fetch(`/api/workspace/agents/${agentId}/tools?workspaceId=${workspaceId}`), fetch(`/api/workspace/agents/${agentId}/knowledge?workspaceId=${workspaceId}`), fetch(`/api/workspace/agents/${agentId}/skills?workspaceId=${workspaceId}`)]);

    const allCoreOk = providersRes.ok && toolsRes.ok && mcpRes.ok && customToolsRes.ok && kbRes.ok && skillsRes.ok && bindingsRes.ok && knowledgeBindingsRes.ok && skillBindingsRes.ok;
    if (!allCoreOk) {
      throw new Error("Unable to load agent settings");
    }

    const providerCatalog = (await providersRes.json()) as {
      providers: Provider[];
      models: Model[];
    };
    const providerRows = providerCatalog.providers;
    const builtinRows = ((await toolsRes.json()) as BuiltinTool[]).filter((tool) => tool.enabled !== false);
    const mcpServerRows = (await mcpRes.json()) as McpServer[];
    const customToolRows = (await customToolsRes.json()) as CustomTool[];
    const kbRows = (await kbRes.json()) as KnowledgeBase[];
    const skillRows = (await skillsRes.json()) as AgentSkill[];
    const toolBindings = (await bindingsRes.json()) as ToolBinding[];
    const knowledgeBindings = (
      (await knowledgeBindingsRes.json()) as {
        bindings: KnowledgeBinding[];
      }
    ).bindings;
    const skillBindings = (
      (await skillBindingsRes.json()) as {
        bindings: SkillBinding[];
      }
    ).bindings;

    const modelRows = providerCatalog.models;

    const mcpToolRows = (
      await Promise.all(
        mcpServerRows.map(async (server) => {
          const res = await fetch(`/api/workspace/mcp-servers/${server.id}/tools?workspaceId=${workspaceId}`);
          return res.ok ? ((await res.json()) as McpTool[]) : [];
        }),
      )
    ).flat();

    setProviders(providerRows);
    setModels(modelRows);
    setBuiltinTools(builtinRows);
    setMcpServers(mcpServerRows);
    setMcpTools(mcpToolRows);
    setCustomTools(customToolRows);
    setKnowledgeBases(kbRows);
    setSkills(skillRows);

    setBuiltinBindings(buildToolBindingMap(builtinRows, toolBindings, "builtin", (tool) => tool.requireApproval ?? false));
    setMcpBindings(buildToolBindingMap(mcpToolRows, toolBindings, "mcp", (tool) => tool.requireApproval ?? false));
    setCustomBindings(buildToolBindingMap(customToolRows, toolBindings, "custom", () => true));
    setSelectedKnowledgeIds(knowledgeBindings.map((b) => b.knowledgeBaseId));
    setSelectedSkillIds(skillBindings.map((b) => b.skillId));
  }, [agentId, workspaceId]);

  useEffect(() => {
    if (!agentId || !workspaceId) return;
    let cancelled = false;
    const timeout = window.setTimeout(() => {
      setLoading(true);
      setLoadError(null);
      void loadData()
        .catch(() => {
          if (!cancelled) {
            setLoadError(t("configurePage.loadErrorDescription"));
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
          return;
        });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [agentId, workspaceId, loadData, t]);

  const retryLoad = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    void loadData()
      .catch(() => setLoadError(t("configurePage.loadErrorDescription")))
      .finally(() => setLoading(false));
  }, [loadData, t]);

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

  if (workspaceLoading || !workspaceId || loading) {
    return <PageLoading label={t("configure")} />;
  }

  if (loadError || !agent) {
    return (
      <WorkspacePage title={t("configurePage.loadErrorTitle")} description={t("configurePage.loadErrorDescription")} width="narrow">
        <div className="rounded-2xl border border-destructive/25 bg-destructive/5 p-5" role="alert">
          <p className="text-sm text-muted-foreground">{loadError ?? t("configurePage.loadErrorDescription")}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={retryLoad}>
              {t("configurePage.retry")}
            </Button>
            <Button asChild type="button" size="sm" variant="outline">
              <Link href="/agents">{t("configurePage.back")}</Link>
            </Button>
          </div>
        </div>
      </WorkspacePage>
    );
  }

  const enabledBuiltinCount = builtinTools.filter((tool) => builtinBindings[tool.id]?.enabled).length;
  const enabledMcpCount = mcpTools.filter((tool) => tool.enabled && mcpBindings[tool.id]?.enabled).length;
  const totalEnabledTools = enabledBuiltinCount + enabledMcpCount;
  const capabilitiesCount = totalEnabledTools + selectedKnowledgeIds.length + selectedSkillIds.length;
  const delegationCount = delegationConfig.bindings.length;
  const canEdit = agent?.canEdit ?? false;
  const hasModel = Boolean(form.providerId && form.modelId);

  return {
    kind: "ready",
    activeTab,
    agent,
    builtinBindings,
    builtinTools,
    canEdit,
    capabilitiesCount,
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
    setDelegationConfig,
    setForm,
    setMcpBindings,
    setSelectedKnowledgeIds,
    setSelectedSkillIds,
    setShowDeleteDialog,
    showDeleteDialog,
    skills,
    t,
  } as const;
}

export default function AgentConfigurePage(...args: Parameters<typeof useAgentConfigurePageController>) {
  const model = useAgentConfigurePageController(...args);
  if (!("kind" in model)) return model;
  return <AgentConfigurePageView model={model} />;
}
