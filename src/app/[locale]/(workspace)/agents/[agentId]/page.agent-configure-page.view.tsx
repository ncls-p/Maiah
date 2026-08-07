import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WorkspacePage } from "@/components/workspace-page";

import { AgentHeader } from "./agent-header";
import { CapabilitiesTab } from "./capabilities-tab";
import { DeleteDialog } from "./delete-dialog";
import { EssentialTab } from "./essential-tab";
import { OrchestrationTab } from "./orchestration-tab";
import type { useAgentConfigurePageController } from "./page.agent-configure-page";
import { TabBadge } from "./shared";

type ViewModel = Extract<
  ReturnType<typeof useAgentConfigurePageController>,
  { kind: "ready" }
>;
export function AgentConfigurePageView({ model }: { model: ViewModel }) {
  const {
    activeTab,
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
                  form={form}
                  setFormAction={setForm}
                  providers={providers}
                  models={models}
                  toolOptions={toolOptions}
                  saving={saving}
                  canAdminCurate={agent?.canAdminCurate ?? false}
                  canManageProviders={permissions.canManageProviders}
                  agentKind={agent?.kind ?? "assistant"}
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
