"use client";
import { ResourceProvenanceBadge } from "@/components/resource-provenance-badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { BookMarkedIcon,BookOpenIcon,PlusIcon,SaveIcon,ServerIcon,WrenchIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { buildBuiltinToolPackages } from "./capabilities-tab.builtin-tool-package";
import { BuiltinToolPackageCard } from "./capabilities-tab.builtin-tool-package-card";
import { McpServerCollapsible } from "./capabilities-tab.mcp-server-collapsible";
import { ConfigSection } from "./config-section";
import type { AgentSkill,BuiltinTool,KnowledgeBase,McpServer,McpTool,ToolBindingState } from "./types";
export function CapabilitiesTab({
  builtinTools,
  builtinBindings,
  setBuiltinBindingsAction: setBuiltinBindings,
  mcpServers,
  mcpTools,
  mcpBindings,
  setMcpBindingsAction: setMcpBindings,
  knowledgeBases,
  selectedKnowledgeIds,
  setSelectedKnowledgeIdsAction: setSelectedKnowledgeIds,
  skills,
  selectedSkillIds,
  setSelectedSkillIdsAction: setSelectedSkillIds,
  saving,
  readOnly = false,
  canConfigureBuiltinApproval = false,
  onSaveAction: onSave,
}: {
  builtinTools: BuiltinTool[];
  builtinBindings: ToolBindingState;
  setBuiltinBindingsAction: (fn: (prev: ToolBindingState) => ToolBindingState) => void;
  mcpServers: McpServer[];
  mcpTools: McpTool[];
  mcpBindings: ToolBindingState;
  setMcpBindingsAction: (fn: (prev: ToolBindingState) => ToolBindingState) => void;
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
}) {
  const t = useTranslations("agents.configurePage");
  const tCap = useTranslations("agents.capabilities");
  const tCommon = useTranslations("common");
  const builtinToolPackages = buildBuiltinToolPackages(builtinTools);
  return (
    <div className={cn("space-y-3", readOnly && "pointer-events-none opacity-75")}>
      <ConfigSection title={t("builtinTools")} description={t("builtinToolsHint")} icon={WrenchIcon} stagger="3">
        {builtinTools.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">{t("noBuiltinTools")}</p>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{t("toolPackagesHint")}</p>
            {builtinToolPackages.map((toolPackage) => {
              const selectedCount = toolPackage.tools.filter((tool) => builtinBindings[tool.id]?.enabled).length;
              return (
                <BuiltinToolPackageCard
                  key={toolPackage.id}
                  toolPackage={toolPackage}
                  bindings={builtinBindings}
                  setBindings={setBuiltinBindings}
                  packageLabel={t(`toolPackages.${toolPackage.id}.title`)}
                  description={t(`toolPackages.${toolPackage.id}.description`)}
                  countLabel={t("toolPackageCount", {
                    enabled: selectedCount,
                    total: toolPackage.tools.length,
                  })}
                  allToolsLabel={t("allTools")}
                  extraApprovalLabel={t("extraApproval")}
                  detailsLabel={t("customizePackage")}
                  partialLabel={t("partial")}
                  mixedApprovalLabel={t("mixedApproval")}
                  approvalLabel={t("approval")}
                  canConfigureApproval={canConfigureBuiltinApproval}
                />
              );
            })}
          </div>
        )}
      </ConfigSection>
      <ConfigSection title={t("mcpTools")} description={t("mcpToolsHint")} icon={ServerIcon} stagger="4">
        {mcpServers.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <p className="text-sm text-muted-foreground">{t("noMcpServers")}</p>
            <Button variant="outline" size="sm" asChild>
              <Link href="/tools?tab=mcp">
                <ServerIcon className="size-4" aria-hidden="true" />
                {t("addMcp")}
              </Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {mcpServers.map((server) => (
              <McpServerCollapsible key={server.id} server={server} mcpTools={mcpTools} mcpServers={mcpServers} mcpBindings={mcpBindings} setMcpBindings={setMcpBindings} noMcpToolsSyncedLabel={t("noMcpToolsSynced")} disabledInMcpLabel={t("disabledInMcp")} allToolsLabel={t("allTools")} extraApprovalLabel={t("extraApproval")} approvalLabel={t("approval")} partialLabel={t("partial")} mixedApprovalLabel={t("mixedApproval")} forcedLabel={t("forced")} />
            ))}
            <Button variant="outline" size="sm" asChild className="w-fit">
              <Link href="/tools?tab=mcp">{t("manageMcp")}</Link>
            </Button>
          </div>
        )}
      </ConfigSection>
      <ConfigSection title={tCap("skillsTitle")} description={tCap("skillsHint")} icon={BookMarkedIcon} stagger="5">
        {skills.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border/60 py-8 text-center">
            <BookMarkedIcon className="size-8 text-muted-foreground/50" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">{tCap("noSkills")}</p>
            <Button variant="outline" size="sm" asChild>
              <Link href="/tools?tab=skills">
                <PlusIcon className="size-4" aria-hidden="true" />
                {tCap("installSkill")}
              </Link>
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {skills.map((skill) => (
              <label key={skill.id} className={cn("ui-list-row flex cursor-pointer items-center justify-between gap-4 rounded-xl border p-4 transition-[background-color,border-color,box-shadow] duration-150 ease-out hover:border-primary/25 hover:bg-card/65 hover:shadow-[var(--surface-shadow-hover)]", selectedSkillIds.includes(skill.id) ? "border-primary/30 bg-primary/5" : "border-border/60")}>
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2 font-medium">
                    <span className={cn("flex size-8 items-center justify-center rounded-lg", selectedSkillIds.includes(skill.id) ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
                      <BookMarkedIcon className="size-4" aria-hidden="true" />
                    </span>
                    <span>{skill.name}</span>
                    <ResourceProvenanceBadge provenance={skill.provenance} />
                  </span>
                  {skill.description ? <span className="mt-1 line-clamp-1 block text-xs text-muted-foreground">{skill.description}</span> : null}
                </span>
                <Switch aria-label={tCap("toggleSkill", { name: skill.name })} checked={selectedSkillIds.includes(skill.id)} onCheckedChange={(checked) => setSelectedSkillIds((current) => (checked ? [...current, skill.id] : current.filter((id) => id !== skill.id)))} />
              </label>
            ))}
          </div>
        )}
      </ConfigSection>
      <ConfigSection title={t("knowledge")} description={t("knowledgeHint")} icon={BookOpenIcon} stagger="5">
        {knowledgeBases.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border/60 py-8 text-center">
            <BookOpenIcon className="size-8 text-muted-foreground/50" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">{t("noKnowledge")}</p>
            <Button variant="outline" size="sm" asChild>
              <Link href="/knowledge">
                <PlusIcon className="size-4" aria-hidden="true" />
                {t("createKnowledge")}
              </Link>
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {knowledgeBases.map((kb) => (
              <label key={kb.id} className={cn("ui-list-row flex cursor-pointer items-center justify-between rounded-xl border p-4 transition-[background-color,border-color,box-shadow] duration-150 ease-out hover:border-primary/25 hover:bg-card/65 hover:shadow-[var(--surface-shadow-hover)]", selectedKnowledgeIds.includes(kb.id) ? "border-primary/30 bg-primary/5" : "border-border/60")}>
                <span className="flex flex-wrap items-center gap-2 font-medium">
                  <span className={cn("flex size-8 items-center justify-center rounded-lg", selectedKnowledgeIds.includes(kb.id) ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
                    <BookOpenIcon className="size-4" aria-hidden="true" />
                  </span>
                  <span>{kb.name}</span>
                  <ResourceProvenanceBadge provenance={kb.provenance} />
                </span>
                <Switch aria-label={tCap("toggleKnowledge", { name: kb.name })} checked={selectedKnowledgeIds.includes(kb.id)} onCheckedChange={(checked) => setSelectedKnowledgeIds((current) => (checked ? [...current, kb.id] : current.filter((id) => id !== kb.id)))} />
              </label>
            ))}
          </div>
        )}
      </ConfigSection>
      {readOnly ? null : (
        <div className="flex justify-end rounded-2xl border border-border/60 bg-card/75 p-3 shadow-[var(--surface-shadow)]">
          <Button type="button" disabled={saving} onClick={onSave}>
            {saving ? <Spinner data-icon="inline-start" /> : <SaveIcon data-icon="inline-start" aria-hidden="true" />}
            {tCommon("save")}
          </Button>
        </div>
      )}
    </div>
  );
}
