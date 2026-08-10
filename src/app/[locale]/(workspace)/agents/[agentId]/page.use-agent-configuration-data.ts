import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import {
  buildAgentFormFromVersion,
  type AgentVersionPayload,
} from "./agent-form-from-version";
import {
  buildToolBindingMap,
  defaultDelegationConfig,
} from "./page.build-tool-binding-map";
import type {
  Agent,
  AgentForm,
  AgentSkill,
  BuiltinTool,
  CustomTool,
  DelegationConfig,
  KnowledgeBase,
  KnowledgeBinding,
  McpServer,
  McpTool,
  Model,
  Provider,
  SkillBinding,
  ToolBinding,
  ToolBindingState,
} from "./types";
import { createEmptyForm } from "./types";

export function useAgentConfigurationData(
  agentId: string,
  workspaceId: string | null,
) {
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
  const [selectedKnowledgeIds, setSelectedKnowledgeIds] = useState<string[]>(
    [],
  );
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
  const [delegationConfig, setDelegationConfig] = useState<DelegationConfig>(
    defaultDelegationConfig,
  );
  const [delegationCandidates, setDelegationCandidates] = useState<Agent[]>([]);

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const loadData = useCallback(async () => {
    if (!agentId || !workspaceId) return;

    const agentRes = await fetch(
      `/api/workspace/agents/${agentId}?workspaceId=${workspaceId}`,
    );
    if (!agentRes.ok) {
      throw new Error("Unable to load agent settings");
    }

    const nextAgent = (await agentRes.json()) as Agent;

    let activeVersion: AgentVersionPayload | null = null;
    if (nextAgent.activeVersionId) {
      const versionRes = await fetch(
        `/api/workspace/agents/${agentId}/versions?workspaceId=${workspaceId}&versionId=${nextAgent.activeVersionId}`,
      );
      if (versionRes.ok) {
        activeVersion = (await versionRes.json()) as AgentVersionPayload;
      }
    }
    if (!activeVersion) {
      const versionsRes = await fetch(
        `/api/workspace/agents/${agentId}/versions?workspaceId=${workspaceId}`,
      );
      if (versionsRes.ok) {
        const versions = (await versionsRes.json()) as AgentVersionPayload[];
        if (Array.isArray(versions)) {
          activeVersion =
            versions.find((version) => version.isActive) ?? versions[0] ?? null;
        }
      }
    }

    setAgent(nextAgent);
    setForm(
      buildAgentFormFromVersion(
        nextAgent,
        activeVersion,
        nextAgent.shareTargetEmail,
      ),
    );

    if (nextAgent.kind === "orchestrator") {
      const [delegationResponse, agentsResponse] = await Promise.all([
        fetch(
          `/api/workspace/agents/${agentId}/delegations?workspaceId=${workspaceId}`,
        ),
        fetch(
          `/api/workspace/agents?workspaceId=${workspaceId}&includeModelMeta=false`,
        ),
      ]);
      if (!delegationResponse.ok || !agentsResponse.ok) {
        throw new Error("Unable to load orchestrator settings");
      }
      const delegationPayload = (await delegationResponse.json()) as Omit<
        DelegationConfig,
        "policy"
      > & { policy: DelegationConfig["policy"] | null };
      const agentsPayload = (await agentsResponse.json()) as
        Agent[] | { agents?: Agent[] };
      setDelegationConfig({
        ...defaultDelegationConfig,
        ...delegationPayload,
        policy: delegationPayload.policy ?? defaultDelegationConfig.policy,
      });
      setDelegationCandidates(
        Array.isArray(agentsPayload)
          ? agentsPayload
          : (agentsPayload.agents ?? []),
      );
    } else {
      setDelegationConfig(defaultDelegationConfig);
      setDelegationCandidates([]);
    }

    if (!nextAgent.canEdit) {
      const providerCatalogRes = await fetch(
        `/api/workspace/providers?workspaceId=${workspaceId}&includeModels=true`,
      );
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

    const [
      providersRes,
      toolsRes,
      mcpRes,
      customToolsRes,
      kbRes,
      skillsRes,
      bindingsRes,
      knowledgeBindingsRes,
      skillBindingsRes,
    ] = await Promise.all([
      fetch(
        `/api/workspace/providers?workspaceId=${workspaceId}&includeModels=true`,
      ),
      fetch(`/api/workspace/tools?workspaceId=${workspaceId}`),
      fetch(`/api/workspace/mcp-servers?workspaceId=${workspaceId}`),
      fetch(`/api/workspace/custom-tools?workspaceId=${workspaceId}`),
      fetch(`/api/workspace/knowledge-bases?workspaceId=${workspaceId}`),
      fetch(`/api/workspace/skills?workspaceId=${workspaceId}`),
      fetch(
        `/api/workspace/agents/${agentId}/tools?workspaceId=${workspaceId}`,
      ),
      fetch(
        `/api/workspace/agents/${agentId}/knowledge?workspaceId=${workspaceId}`,
      ),
      fetch(
        `/api/workspace/agents/${agentId}/skills?workspaceId=${workspaceId}`,
      ),
    ]);

    const allCoreOk =
      providersRes.ok &&
      toolsRes.ok &&
      mcpRes.ok &&
      customToolsRes.ok &&
      kbRes.ok &&
      skillsRes.ok &&
      bindingsRes.ok &&
      knowledgeBindingsRes.ok &&
      skillBindingsRes.ok;
    if (!allCoreOk) {
      throw new Error("Unable to load agent settings");
    }

    const providerCatalog = (await providersRes.json()) as {
      providers: Provider[];
      models: Model[];
    };
    const providerRows = providerCatalog.providers;
    const builtinRows = ((await toolsRes.json()) as BuiltinTool[]).filter(
      (tool) => tool.enabled !== false,
    );
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
          const res = await fetch(
            `/api/workspace/mcp-servers/${server.id}/tools?workspaceId=${workspaceId}`,
          );
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

    setBuiltinBindings(
      buildToolBindingMap(
        builtinRows,
        toolBindings,
        "builtin",
        (tool) => tool.requireApproval ?? false,
      ),
    );
    setMcpBindings(
      buildToolBindingMap(
        mcpToolRows,
        toolBindings,
        "mcp",
        (tool) => tool.requireApproval ?? false,
      ),
    );
    setCustomBindings(
      buildToolBindingMap(customToolRows, toolBindings, "custom", () => true),
    );
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
  return {
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
    setDelegationCandidates,
    showDeleteDialog,
    setShowDeleteDialog,
    deleting,
    setDeleting,
    showCopyableError,
    retryLoad,
  };
}
