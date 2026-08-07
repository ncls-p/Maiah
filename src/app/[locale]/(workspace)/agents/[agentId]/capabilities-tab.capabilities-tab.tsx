"use client";

import { BookMarkedIcon, BookOpenIcon, SaveIcon, ServerIcon, WrenchIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

import { buildBuiltinToolPackages } from "./capabilities-tab.builtin-tool-package";
import { BuiltinToolPackageCard } from "./capabilities-tab.builtin-tool-package-card";
import { CapabilityCatalogControls, type CapabilityDisplayMode, type CapabilityFilter } from "./capabilities-tab.catalog-controls";
import { McpServerCollapsible } from "./capabilities-tab.mcp-server-collapsible";
import { CapabilityResourceGrid } from "./capabilities-tab.resource-grid";
import { ConfigSection } from "./config-section";
import type { AgentSkill, BuiltinTool, CustomTool, KnowledgeBase, McpServer, McpTool, ToolBindingState } from "./types";

type Props = {
  builtinTools: BuiltinTool[];
  builtinBindings: ToolBindingState;
  setBuiltinBindingsAction: (fn: (prev: ToolBindingState) => ToolBindingState) => void;
  mcpServers: McpServer[];
  mcpTools: McpTool[];
  mcpBindings: ToolBindingState;
  setMcpBindingsAction: (fn: (prev: ToolBindingState) => ToolBindingState) => void;
  customTools: CustomTool[];
  customBindings: ToolBindingState;
  setCustomBindingsAction: (fn: (prev: ToolBindingState) => ToolBindingState) => void;
  knowledgeBases: KnowledgeBase[];
  selectedKnowledgeIds: string[];
  setSelectedKnowledgeIdsAction: (fn: (prev: string[]) => string[]) => void;
  skills: AgentSkill[];
  selectedSkillIds: string[];
  setSelectedSkillIdsAction: (fn: (prev: string[]) => string[]) => void;
  saving: boolean;
  readOnly?: boolean;
  canConfigureBuiltinApproval?: boolean;
  onSaveAction: () => void;
};

export function CapabilitiesTab(props: Props) {
  const { builtinTools, builtinBindings, setBuiltinBindingsAction, mcpServers, mcpTools, mcpBindings, setMcpBindingsAction, customTools, customBindings, setCustomBindingsAction, knowledgeBases, selectedKnowledgeIds, setSelectedKnowledgeIdsAction, skills, selectedSkillIds, setSelectedSkillIdsAction, saving, readOnly = false, canConfigureBuiltinApproval = false, onSaveAction } = props;
  const t = useTranslations("agents.configurePage");
  const tCap = useTranslations("agents.capabilities");
  const tList = useTranslations("agents.list");
  const tCommon = useTranslations("common");
  const [filter, setFilter] = useState<CapabilityFilter>("all");
  const [query, setQuery] = useState("");
  const [displayMode, setDisplayMode] = useState<CapabilityDisplayMode>(() => {
    if (typeof window === "undefined") return "list";
    return window.localStorage.getItem("agent-capabilities:display-mode") === "grid" ? "grid" : "list";
  });
  const changeDisplayMode = (mode: CapabilityDisplayMode) => {
    setDisplayMode(mode);
    window.localStorage.setItem("agent-capabilities:display-mode", mode);
  };
  const search = query.trim().toLocaleLowerCase();
  const matches = (...values: Array<string | null | undefined>) => !search || values.some((value) => value?.toLocaleLowerCase().includes(search));
  const packages = buildBuiltinToolPackages(builtinTools).filter((item) => matches(t(`toolPackages.${item.id}.title`), t(`toolPackages.${item.id}.description`), ...item.tools.flatMap((tool) => [tool.name, tool.displayName, tool.description])));
  const servers = mcpServers.filter((server) => matches(server.name, ...mcpTools.filter((tool) => tool.mcpServerId === server.id).flatMap((tool) => [tool.name, tool.description])));
  const custom = customTools.filter((tool) => matches(tool.name, tool.description));
  const filteredSkills = skills.filter((skill) => matches(skill.name, skill.description));
  const knowledge = knowledgeBases.filter((item) => matches(item.name));
  const show = (value: Exclude<CapabilityFilter, "all">) => filter === "all" || filter === value;
  const visibleCount = (show("tools") ? packages.length + custom.length : 0) + (show("mcp") ? servers.length : 0) + (show("knowledge") ? knowledge.length : 0) + (show("skills") ? filteredSkills.length : 0);

  const selectedCustomIds = Object.entries(customBindings).filter(([, binding]) => binding.enabled).map(([id]) => id);
  const setSelectedCustomIds = (update: (current: string[]) => string[]) => setCustomBindingsAction((current) => {
    const selected = new Set(update(Object.entries(current).filter(([, binding]) => binding.enabled).map(([id]) => id)));
    return Object.fromEntries(customTools.map((tool) => [tool.id, { enabled: selected.has(tool.id), requireApproval: current[tool.id]?.requireApproval ?? true }]));
  });

  return (
    <div className={cn("space-y-3", readOnly && "pointer-events-none opacity-75")}>
      <CapabilityCatalogControls filter={filter} setFilter={setFilter} query={query} setQuery={setQuery} displayMode={displayMode} setDisplayMode={changeDisplayMode} counts={{ all: builtinTools.length + customTools.length + mcpTools.length + knowledgeBases.length + skills.length, tools: builtinTools.length + customTools.length, mcp: mcpTools.length, knowledge: knowledgeBases.length, skills: skills.length }} labels={{ all: tCap("filterAll"), tools: tCap("filterTools"), mcp: tCap("filterMcp"), knowledge: tCap("filterKnowledge"), skills: tCap("filterSkills"), search: tCap("searchPlaceholder"), grid: tList("showAsGrid"), list: tList("showAsList") }} />
      {visibleCount === 0 ? <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">{tCap("noSearchResults", { query })}</div> : null}

      {show("tools") && packages.length > 0 ? (
        <ConfigSection title={t("builtinTools")} description={t("builtinToolsHint")} icon={WrenchIcon} stagger="3">
          <p className="mb-3 text-sm text-muted-foreground">{t("toolPackagesHint")}</p>
          <div className={cn("grid gap-3", displayMode === "grid" && "xl:grid-cols-2")}>
            {packages.map((toolPackage) => (
              <BuiltinToolPackageCard key={toolPackage.id} toolPackage={toolPackage} bindings={builtinBindings} setBindings={setBuiltinBindingsAction} packageLabel={t(`toolPackages.${toolPackage.id}.title`)} description={t(`toolPackages.${toolPackage.id}.description`)} countLabel={t("toolPackageCount", { enabled: toolPackage.tools.filter((tool) => builtinBindings[tool.id]?.enabled).length, total: toolPackage.tools.length })} allToolsLabel={t("allTools")} extraApprovalLabel={t("extraApproval")} detailsLabel={t("customizePackage")} partialLabel={t("partial")} mixedApprovalLabel={t("mixedApproval")} approvalLabel={t("approval")} canConfigureApproval={canConfigureBuiltinApproval} />
            ))}
          </div>
        </ConfigSection>
      ) : null}

      {show("tools") && custom.length > 0 ? (
        <ConfigSection title={tCap("customToolsTitle")} description={tCap("customToolsHint")} icon={WrenchIcon} stagger="4">
          <CapabilityResourceGrid resources={custom} selectedIds={selectedCustomIds} setSelectedIds={setSelectedCustomIds} icon={WrenchIcon} displayMode={displayMode} toggleLabel={(name) => tCap("toggleTool", { name })} />
        </ConfigSection>
      ) : null}

      {show("mcp") && servers.length > 0 ? (
        <ConfigSection title={t("mcpTools")} description={t("mcpToolsHint")} icon={ServerIcon} stagger="4">
          <div className={cn("grid gap-3", displayMode === "grid" && "xl:grid-cols-2")}>
            {servers.map((server) => <McpServerCollapsible key={server.id} server={server} mcpTools={mcpTools.filter((tool) => matches(tool.name, tool.description))} mcpServers={mcpServers} mcpBindings={mcpBindings} setMcpBindings={setMcpBindingsAction} noMcpToolsSyncedLabel={t("noMcpToolsSynced")} disabledInMcpLabel={t("disabledInMcp")} allToolsLabel={t("allTools")} extraApprovalLabel={t("extraApproval")} approvalLabel={t("approval")} partialLabel={t("partial")} mixedApprovalLabel={t("mixedApproval")} forcedLabel={t("forced")} />)}
          </div>
        </ConfigSection>
      ) : null}

      {show("skills") && filteredSkills.length > 0 ? (
        <ConfigSection title={tCap("skillsTitle")} description={tCap("skillsHint")} icon={BookMarkedIcon} stagger="5">
          <CapabilityResourceGrid resources={filteredSkills} selectedIds={selectedSkillIds} setSelectedIds={setSelectedSkillIdsAction} icon={BookMarkedIcon} displayMode={displayMode} toggleLabel={(name) => tCap("toggleSkill", { name })} />
        </ConfigSection>
      ) : null}

      {show("knowledge") && knowledge.length > 0 ? (
        <ConfigSection title={t("knowledge")} description={t("knowledgeHint")} icon={BookOpenIcon} stagger="5">
          <CapabilityResourceGrid resources={knowledge} selectedIds={selectedKnowledgeIds} setSelectedIds={setSelectedKnowledgeIdsAction} icon={BookOpenIcon} displayMode={displayMode} toggleLabel={(name) => tCap("toggleKnowledge", { name })} />
        </ConfigSection>
      ) : null}

      {readOnly ? null : <div className="flex justify-end rounded-2xl border border-border/60 bg-card/75 p-3 shadow-[var(--surface-shadow)]"><Button type="button" disabled={saving} onClick={onSaveAction}>{saving ? <Spinner data-icon="inline-start" /> : <SaveIcon data-icon="inline-start" aria-hidden="true" />}{tCommon("save")}</Button></div>}
    </div>
  );
}
