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
import { buildAgentFormFromVersion, type AgentVersionPayload } from "./agent-form-from-version";
import { AgentConfigureLoadError } from "./page.agent-configure-load-error";
import { agentSaveError } from "./page.build-tool-binding-map";
import { buildCapabilityBindings, buildEssentialPayload } from "./page.agent-save-payloads";
import { useAgentConfigurationData } from "./page.use-agent-configuration-data";
import { Agent, DelegationConfig } from "./types";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WorkspacePage } from "@/components/workspace-page";
import { AgentHeader } from "./agent-header";
import { CapabilitiesTab } from "./capabilities-tab";
import { DeleteDialog } from "./delete-dialog";
import { EssentialTab } from "./essential-tab";
import { OrchestrationTab } from "./orchestration-tab";
import { TabBadge } from "./shared";

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


type ViewModel = Extract<
  ReturnType<typeof useAgentConfigurePageController>,
  { kind: "ready" }
>;
export function AgentConfigurePageView({ model }: { model: ViewModel }) {
  const {
    activeTab,
    agent,
    agentId,
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
  } = model;
  const toolOptions = [
    ...builtinTools
      .filter((tool) => builtinBindings[tool.id]?.enabled)
      .map((tool) => ({
        name: tool.name,
        label: tool.displayName,
        source: "builtin" as const,
      })),
    ...mcpTools
      .filter((tool) => tool.enabled && mcpBindings[tool.id]?.enabled)
      .map((tool) => ({
        name: tool.name,
        label: tool.name,
        source: "mcp" as const,
      })),
    ...customTools
      .filter((tool) => customBindings[tool.id]?.enabled)
      .map((tool) => ({
        name: tool.name,
        label: tool.name,
        source: "custom" as const,
      })),
  ];
  return (
    <WorkspacePage
      title={agent?.name ?? t("configure")}
      description={agent.description || t("configureDescription")}
      width="default"
      headerVariant="compact"
    >
      <div className="flex flex-col gap-4">
        {!canEdit ? (
          <div className="flex flex-col gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 text-muted-foreground">
              <p className="font-medium text-foreground">
                {t("configurePage.lockedTitle")}
              </p>
              <p className="mt-1">{t("configurePage.lockedDescription")}</p>
            </div>
            {agent.canClone !== false ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="shrink-0"
                onClick={() => void handleClone()}
              >
                {t("configurePage.cloneToEdit")}
              </Button>
            ) : null}
          </div>
        ) : null}

        <AgentHeader
          agent={agent}
          providers={providers}
          models={models}
          form={form}
          canEdit={canEdit}
          onLogoChangeAction={(logoUrl) => void handleLogoChange(logoUrl)}
          onCloneAction={() => void handleClone()}
          onShowDeleteDialogAction={() => setShowDeleteDialog(true)}
        />

        {canEdit &&
        (!hasModel ||
          (agent.kind === "orchestrator" && delegationCount === 0)) ? (
          <div className="rounded-2xl border border-primary/15 bg-primary/5 p-4 animate-in-fade stagger-2">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-base font-semibold">
                  {!hasModel
                    ? t("configurePage.setupTitle")
                    : t("configurePage.orchestrationSetupTitle")}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {!hasModel
                    ? t("configurePage.setupDescription")
                    : t("configurePage.orchestrationSetupDescription")}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant={hasModel ? "default" : "outline"}
                onClick={() =>
                  setActiveTab(hasModel ? "orchestration" : "essential")
                }
              >
                {hasModel
                  ? t("configurePage.chooseSpecialistsCta")
                  : t("configurePage.chooseModelCta")}
              </Button>
            </div>
          </div>
        ) : null}

        {canEdit ? (
          <div className="animate-in-fade stagger-3">
            <Tabs
              value={activeTab}
              onValueChange={setActiveTab}
              className="gap-4"
            >
              <TabsList
                aria-label={t("configurePage.settingsNavigation")}
                className="justify-start"
              >
                <TabsTrigger value="essential" className="gap-2">
                  {t("tabs.essential")}
                </TabsTrigger>
                <TabsTrigger value="capabilities" className="gap-2">
                  {t("tabs.capabilities")}
                  <TabBadge count={capabilitiesCount} />
                </TabsTrigger>
                {agent?.kind === "orchestrator" ? (
                  <TabsTrigger value="orchestration" className="gap-2">
                    {t("tabs.orchestration")}
                    <TabBadge count={delegationCount} />
                  </TabsTrigger>
                ) : null}
              </TabsList>

              <TabsContent value="essential">
                <EssentialTab
                  agentId={agentId}
                  agentName={agent.name}
                  workspaceId={workspaceId}
                  form={form}
                  setFormAction={setForm}
                  providers={providers}
                  models={models}
                  toolOptions={toolOptions}
                  saving={saving}
                  canAdminCurate={agent?.canAdminCurate ?? false}
                  canManageProviders={permissions.canManageProviders}
                  agentKind={agent?.kind ?? "assistant"}
                  accessOptions={
                    agent?.accessOptions ?? {
                      scopes: ["private"],
                      teams: [],
                      projectName: "",
                      organizationName: "",
                    }
                  }
                  readOnly={!canEdit}
                  onSaveAction={saveEssential}
                />
              </TabsContent>

              <TabsContent value="capabilities">
                <CapabilitiesTab
                  builtinTools={builtinTools}
                  builtinBindings={builtinBindings}
                  setBuiltinBindingsAction={setBuiltinBindings}
                  mcpServers={mcpServers}
                  mcpTools={mcpTools}
                  mcpBindings={mcpBindings}
                  setMcpBindingsAction={setMcpBindings}
                  customTools={customTools}
                  customBindings={customBindings}
                  setCustomBindingsAction={setCustomBindings}
                  knowledgeBases={knowledgeBases}
                  selectedKnowledgeIds={selectedKnowledgeIds}
                  setSelectedKnowledgeIdsAction={setSelectedKnowledgeIds}
                  skills={skills}
                  selectedSkillIds={selectedSkillIds}
                  setSelectedSkillIdsAction={setSelectedSkillIds}
                  saving={saving}
                  readOnly={!canEdit}
                  canConfigureBuiltinApproval={agent?.canAdminCurate ?? false}
                  onSaveAction={() => void saveCapabilities()}
                />
              </TabsContent>

              {agent?.kind === "orchestrator" ? (
                <TabsContent value="orchestration">
                  <OrchestrationTab
                    agent={agent}
                    availableAgents={delegationCandidates}
                    config={delegationConfig}
                    setConfigAction={setDelegationConfig}
                    saving={saving}
                    onSaveAction={() => void saveOrchestration()}
                  />
                </TabsContent>
              ) : null}
            </Tabs>
          </div>
        ) : null}
      </div>

      <DeleteDialog
        open={showDeleteDialog}
        onOpenChange={(open) => {
          if (!open) setShowDeleteDialog(false);
        }}
        agentName={agent?.name ?? null}
        deleting={deleting}
        onDelete={handleDelete}
      />
    </WorkspacePage>
  );
}

