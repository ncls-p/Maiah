"use client";
import { useTranslations } from "next-intl";
import { useState, type SyntheticEvent } from "react";
import { Agent, AgentForm, AgentToolPolicyOption, Model, Provider } from "./types";
import { MessageSquareIcon, SettingsIcon, UsersIcon, SaveIcon } from "lucide-react";
import { AgentAccessScopePicker } from "@/components/agent-access-scope-picker";
import { ModelLogo } from "@/components/providers/model-logo";
import { ResourceAccessDialog } from "@/components/resource-access-dialog";
import { AdvancedSection } from "@/components/ui/advanced-section";
import { Button } from "@/components/ui/button";
import { Field, FieldContent, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ConfigSection } from "./config-section";
import { ModelAdvancedFields } from "./model-advanced-fields";
import { getProviderKindIcon } from "./utils";
import { Spinner } from "@/components/ui/spinner";
import { Checkbox } from "@/components/ui/checkbox";
import { Link } from "@/i18n/navigation";

export function useEssentialTabController({
  agentId,
  agentName,
  workspaceId,
  form,
  setFormAction: setForm,
  providers,
  models,
  toolOptions,
  saving,
  canAdminCurate,
  canManageProviders,
  agentKind,
  accessOptions,
  readOnly = false,
  onSaveAction: onSave,
}: {
  agentId: string;
  agentName: string;
  workspaceId: string;
  form: AgentForm;
  setFormAction: (fn: (prev: AgentForm) => AgentForm) => void;
  providers: Provider[];
  models: Model[];
  toolOptions: AgentToolPolicyOption[];
  saving: boolean;
  canAdminCurate: boolean;
  canManageProviders: boolean;
  agentKind: Agent["kind"];
  accessOptions: Agent["accessOptions"];
  readOnly?: boolean;
  onSaveAction: (e: SyntheticEvent<HTMLFormElement>) => void;
}) {
  const t = useTranslations("agents");
  const [showPeopleAccess, setShowPeopleAccess] = useState(false);
  const tModel = useTranslations("agents.model");
  const tCommon = useTranslations("common");
  const filteredModels = models.filter((m) => m.providerId === form.providerId);
  const hasProviders = providers.length > 0;
  const selectedProviderHasModels =
    !form.providerId || filteredModels.length > 0;
  const selectedModel = models.find((model) => model.id === form.modelId);

  return {
    kind: "ready",
    agentId,
    agentKind,
    agentName,
    accessOptions,
    canAdminCurate,
    canManageProviders,
    filteredModels,
    form,
    hasProviders,
    onSave,
    providers,
    readOnly,
    saving,
    selectedModel,
    selectedProviderHasModels,
    setForm,
    setShowPeopleAccess,
    showPeopleAccess,
    t,
    tCommon,
    tModel,
    toolOptions,
    workspaceId,
  } as const;
}

export function EssentialTab(
  ...args: Parameters<typeof useEssentialTabController>
) {
  const model = useEssentialTabController(...args);
  if (!("kind" in model)) return model;
  return <EssentialTabView model={model} />;
}


export type EssentialTabViewModel = Extract<
  ReturnType<typeof useEssentialTabController>,
  { kind: "ready" }
>;
export function EssentialTabView({ model }: { model: EssentialTabViewModel }) {
  const {
    accessOptions,
    agentId,
    agentName,
    canAdminCurate,
    filteredModels,
    form,
    hasProviders,
    onSave,
    providers,
    readOnly,
    selectedModel,
    selectedProviderHasModels,
    setForm,
    setShowPeopleAccess,
    showPeopleAccess,
    t,
    tCommon,
    tModel,
    toolOptions,
    workspaceId,
  } = model;
  return (
    <form
      onSubmit={readOnly ? (event) => event.preventDefault() : onSave}
      className="flex flex-col gap-3"
    >
      <fieldset disabled={readOnly} className="contents">
        <ConfigSection
          title={t("name")}
          description={t("configurePage.identityHint")}
          icon={SettingsIcon}
          stagger="3"
        >
          <FieldGroup className="gap-4">
            <Field>
              <FieldLabel htmlFor="agent-name">{t("name")}</FieldLabel>
              <FieldContent>
                <Input
                  id="agent-name"
                  required
                  value={form.name}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, name: e.target.value }))
                  }
                />
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel htmlFor="agent-description">
                {t("descriptionLabel")}
              </FieldLabel>
              <FieldContent>
                <Textarea
                  id="agent-description"
                  rows={2}
                  placeholder={t("descriptionPlaceholder")}
                  value={form.description}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      description: e.target.value,
                    }))
                  }
                />
              </FieldContent>
            </Field>
          </FieldGroup>
        </ConfigSection>

        <ConfigSection
          title={t("accessScope.label")}
          description={t("accessScope.hint")}
          icon={UsersIcon}
          stagger="4"
        >
          <AgentAccessScopePicker
            value={form.accessScope}
            teamId={form.accessTeamId}
            options={accessOptions}
            disabled={readOnly}
            onChangeAction={(accessScope, accessTeamId) =>
              setForm((current) => ({
                ...current,
                accessScope,
                accessTeamId: accessTeamId ?? "",
              }))
            }
          />
          <Button
            type="button"
            variant="outline"
            disabled={readOnly}
            onClick={() => setShowPeopleAccess(true)}
          >
            {t("manageSpecificPeople")}
          </Button>
        </ConfigSection>

        <ConfigSection
          title={tModel("modelLabel")}
          description={t("configurePage.modelHint")}
          icon={MessageSquareIcon}
          stagger="5"
        >
          <FieldGroup className="gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="agent-provider">
                  {tModel("provider")}
                </FieldLabel>
                <FieldContent>
                  <Select
                    value={form.providerId || "__none__"}
                    onValueChange={(value) =>
                      setForm((prev) => ({
                        ...prev,
                        providerId: value === "__none__" ? "" : value,
                        modelId: "",
                      }))
                    }
                    disabled={!hasProviders}
                  >
                    <SelectTrigger id="agent-provider" className="w-full">
                      <SelectValue placeholder="—" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">—</SelectItem>
                      {providers.map((provider) => (
                        <SelectItem key={provider.id} value={provider.id}>
                          <span className="flex items-center gap-2">
                            {getProviderKindIcon(provider.kind)}
                            {provider.name}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FieldContent>
              </Field>
              <Field>
                <FieldLabel htmlFor="agent-model">
                  {tModel("modelLabel")}
                </FieldLabel>
                <FieldContent>
                  <Select
                    value={form.modelId || "__none__"}
                    onValueChange={(value) =>
                      setForm((prev) => ({
                        ...prev,
                        modelId: value === "__none__" ? "" : value,
                      }))
                    }
                    disabled={!form.providerId}
                  >
                    <SelectTrigger id="agent-model" className="w-full">
                      <SelectValue placeholder="—" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">—</SelectItem>
                      {filteredModels.map((model) => {
                        const modelLabel = model.displayName || model.modelId;
                        return (
                          <SelectItem key={model.id} value={model.id}>
                            <span className="flex items-center gap-2">
                              <ModelLogo
                                logoUrl={model.logoUrl}
                                label={modelLabel}
                                size="sm"
                              />
                              {modelLabel}
                            </span>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </FieldContent>
              </Field>
            </div>
            {!hasProviders ? (
              <EssentialTabBranch6 model={model} />
            ) : !selectedProviderHasModels ? (
              <EssentialTabBranch5 model={model} />
            ) : null}
            <Field>
              <FieldLabel htmlFor="agent-prompt">
                {tModel("systemPrompt")}
              </FieldLabel>
              <FieldContent>
                <Textarea
                  id="agent-prompt"
                  className="min-h-36 font-mono text-sm"
                  placeholder={tModel("systemPromptPlaceholder")}
                  value={form.systemPrompt}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      systemPrompt: e.target.value,
                    }))
                  }
                />
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel htmlFor="agent-prompt-suggestions">
                {tModel("promptSuggestions")}
              </FieldLabel>
              <FieldContent>
                <Textarea
                  id="agent-prompt-suggestions"
                  className="min-h-24 text-sm"
                  placeholder={tModel("promptSuggestionsPlaceholder")}
                  value={form.promptSuggestions}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      promptSuggestions: e.target.value,
                    }))
                  }
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  {tModel("promptSuggestionsHint")}
                </p>
              </FieldContent>
            </Field>
          </FieldGroup>
        </ConfigSection>

        <AdvancedSection
          label={tCommon("advanced")}
          hint={t("advancedHint")}
          storageKey="advanced:agent-settings"
          className="animate-in-up stagger-5"
        >
          <div className="space-y-6">
            <FieldGroup className="gap-4">
              <Field>
                <FieldLabel htmlFor="agent-slug">
                  {t("configurePage.technicalId")}
                </FieldLabel>
                <FieldContent>
                  <Input
                    id="agent-slug"
                    required
                    pattern="[a-z0-9-]+"
                    value={form.slug}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        slug: e.target.value.toLowerCase(),
                      }))
                    }
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("configurePage.technicalIdHint")}
                  </p>
                </FieldContent>
              </Field>
            </FieldGroup>

            {canAdminCurate ? <EssentialTabBranch2 model={model} /> : null}

            <div className="border-t border-border/50 pt-4">
              <p className="mb-3 flex items-center gap-2 text-sm font-medium">
                <MessageSquareIcon
                  className="size-4 text-muted-foreground"
                  aria-hidden="true"
                />
                {tModel("advancedHint")}
              </p>
              <ModelAdvancedFields
                form={form}
                setFormAction={setForm}
                selectedModel={selectedModel}
                toolOptions={toolOptions}
              />
            </div>
          </div>
        </AdvancedSection>
      </fieldset>

      {readOnly ? null : <EssentialTabBranch1 model={model} />}
      <ResourceAccessDialog
        open={showPeopleAccess}
        workspaceId={workspaceId}
        resource={{ id: agentId, name: agentName, type: "agent" }}
        selection={{ scope: form.accessScope, teamId: form.accessTeamId }}
        options={accessOptions}
        includeDependencies
        showScope={false}
        onOpenChangeAction={setShowPeopleAccess}
      />
    </form>
  );
}


export function EssentialTabBranch1({
  model,
}: {
  model: EssentialTabViewModel;
}) {
  const { saving, tCommon } = model;
  return (
    <div className="flex justify-end rounded-2xl border border-border/60 bg-card/75 p-3 shadow-[var(--surface-shadow)]">
      <Button type="submit" disabled={saving}>
        {saving ? (
          <Spinner data-icon="inline-start" />
        ) : (
          <SaveIcon data-icon="inline-start" aria-hidden="true" />
        )}
        {tCommon("save")}
      </Button>
    </div>
  );
}


export function EssentialTabBranch2({
  model,
}: {
  model: EssentialTabViewModel;
}) {
  const { form, setForm, t } = model;
  return (
    <FieldGroup className="gap-3 border-t border-border/50 pt-4">
      <label className="flex items-center gap-3 rounded-xl border border-border/60 p-3 text-sm">
        <Checkbox
          aria-label={t("configurePage.globalAssistant")}
          checked={form.isGlobal}
          onCheckedChange={(checked) =>
            setForm((prev) => ({
              ...prev,
              isGlobal: checked === true,
            }))
          }
        />
        {t("configurePage.globalAssistant")}
      </label>
      <label className="flex items-center gap-3 rounded-xl border border-border/60 p-3 text-sm">
        <Checkbox
          aria-label={t("configurePage.recommended")}
          checked={form.isRecommended}
          onCheckedChange={(checked) =>
            setForm((prev) => ({
              ...prev,
              isRecommended: checked === true,
            }))
          }
        />
        {t("configurePage.recommended")}
      </label>
    </FieldGroup>
  );
}


export function EssentialTabBranch5({
  model,
}: {
  model: EssentialTabViewModel;
}) {
  const { canManageProviders, t } = model;
  return (
    <div
      role="status"
      className="rounded-2xl border border-dashed border-border/80 bg-muted/35 p-4 text-sm"
    >
      <p className="font-medium text-foreground">
        {t("configurePage.noModelsForProviderTitle")}
      </p>
      <p className="mt-1 text-muted-foreground">
        {canManageProviders
          ? t("configurePage.noModelsForProviderAdmin")
          : t("configurePage.noModelsForProviderMember")}
      </p>
    </div>
  );
}


export function EssentialTabBranch6({
  model,
}: {
  model: EssentialTabViewModel;
}) {
  const { canManageProviders, t } = model;
  return (
    <div
      role="status"
      className="flex flex-col gap-3 rounded-2xl border border-dashed border-border/80 bg-muted/35 p-4 text-sm sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="min-w-0">
        <p className="font-medium text-foreground">
          {t("configurePage.noModelConnectionTitle")}
        </p>
        <p className="mt-1 text-muted-foreground">
          {canManageProviders
            ? t("configurePage.noModelConnectionAdmin")
            : t("configurePage.noModelConnectionMember")}
        </p>
      </div>
      {canManageProviders ? (
        <Button asChild type="button" variant="outline" size="sm">
          <Link href="/providers">{t("configurePage.configureModels")}</Link>
        </Button>
      ) : null}
    </div>
  );
}

