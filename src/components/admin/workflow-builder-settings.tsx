"use client";

import { BotIcon, ExternalLinkIcon, WorkflowIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import {
  SettingsDisabledNotice,
  SettingsLoadError,
  SettingsSection,
  SettingsSectionSkeleton,
  SettingsStatusBadge,
} from "@/components/admin/settings-panel";
import { ModelLogo } from "@/components/providers/model-logo";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { useSettingsOrganizationId } from "./organization-settings-context";
import { Link } from "@/i18n/navigation";

const AUTOMATIC = "__automatic__";

type BuilderAgent = {
  id: string;
  name: string;
  description: string | null;
  providerName: string | null;
  modelDisplayName: string | null;
  supportsTools: boolean;
  ready: boolean;
  unavailableReason?: "version" | "provider" | "model" | "tools" | null;
};

type AdminState = {
  config: { agentId: string | null };
  availableAgents: BuilderAgent[];
};

export function WorkflowBuilderSettings() {
  const t = useTranslations("admin.settingsPage.workflowBuilder");
  const tPage = useTranslations("admin.settingsPage");
  const organizationId = useSettingsOrganizationId();
  const [state, setState] = useState<AdminState | null>(null);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadSettings = useCallback(
    async (signal?: AbortSignal) => {
      if (!organizationId) return;
      setLoading(true);
      setLoadError(false);
      try {
        const res = await fetch(
          `/api/admin/workflow-builder?organizationId=${organizationId}`,
          { signal },
        );
        if (!res.ok) throw new Error(tPage("loadFailed"));
        const data = (await res.json()) as AdminState;
        if (signal?.aborted) return;
        setState(data);
        setAgentId(data.config.agentId);
      } catch (error) {
        if (signal?.aborted) return;
        setLoadError(true);
        toast.error(
          error instanceof Error ? error.message : tPage("loadFailed"),
        );
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [tPage, organizationId],
  );

  useEffect(() => {
    if (!organizationId) return;
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async settings bootstrap
    void loadSettings(controller.signal);
    return () => controller.abort();
  }, [loadSettings, organizationId]);

  const selectedAgent = state?.availableAgents.find(
    (agent) => agent.id === agentId,
  );

  async function save() {
    if (!organizationId) return;
    setSaving(true);
    try {
      const res = await fetch(
        `/api/admin/workflow-builder?organizationId=${organizationId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agentId }),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || tPage("saveFailed"));
      }
      const config = (await res.json()) as { agentId: string | null };
      setAgentId(config.agentId);
      setState((current) => (current ? { ...current, config } : current));
      toast.success(t("saved"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tPage("saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  if (loading || !organizationId) {
    return <SettingsSectionSkeleton rows={4} />;
  }

  if (loadError || !state) {
    return (
      <SettingsLoadError
        title={tPage("loadFailed")}
        description={tPage("loadErrorDescription")}
        retryLabel={tPage("retry")}
        onRetry={() => void loadSettings()}
      />
    );
  }

  const badge = selectedAgent?.ready
    ? { label: t("statusReady"), tone: "success" as const }
    : agentId
      ? { label: t("statusUnavailable"), tone: "warning" as const }
      : { label: t("statusAutomatic"), tone: "muted" as const };

  return (
    <SettingsSection
      icon={WorkflowIcon}
      title={t("title")}
      description={t("description")}
      stagger="stagger-4"
      badge={<SettingsStatusBadge {...badge} />}
    >
      <div className="space-y-5">
        <SettingsDisabledNotice
          title={t("toolsTitle")}
          description={t("toolsDescription")}
        />

        {state.availableAgents.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-background p-5 text-center">
            <BotIcon
              className="mx-auto size-6 text-muted-foreground"
              aria-hidden="true"
            />
            <p className="mt-3 text-sm font-medium">{t("emptyTitle")}</p>
            <p className="mx-auto mt-1 max-w-lg text-sm text-muted-foreground">
              {t("emptyDescription")}
            </p>
            <Button className="mt-4" size="sm" asChild>
              <Link href="/agents">{t("configureAgents")}</Link>
            </Button>
          </div>
        ) : null}
        <div className="space-y-4 rounded-xl border bg-background p-4">
          <div className="space-y-2">
            <p className="text-sm font-medium">{t("agentLabel")}</p>
            <Select
              value={agentId ?? AUTOMATIC}
              onValueChange={(value) =>
                setAgentId(value === AUTOMATIC ? null : value)
              }
              disabled={saving}
            >
              <SelectTrigger aria-label={t("agentLabel")}>
                <SelectValue placeholder={t("agentPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={AUTOMATIC}>{t("automatic")}</SelectItem>
                {state.availableAgents.map((agent) => (
                  <SelectItem key={agent.id} value={agent.id}>
                    {agent.name}
                    {agent.modelDisplayName
                      ? ` · ${agent.modelDisplayName}`
                      : ` · ${t("modelMissing")}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {agentId ? t("configuredHint") : t("automaticHint")}
            </p>
          </div>

          {selectedAgent && !selectedAgent.ready ? (
            <p role="status" className="text-sm text-muted-foreground">
              {t("configurationNeeded", {
                reason: t(
                  `unavailableReasons.${selectedAgent.unavailableReason ?? "model"}`,
                ),
              })}
            </p>
          ) : null}
          {selectedAgent ? (
            <div className="flex items-center gap-3 rounded-lg bg-muted/45 p-3">
              <ModelLogo
                label={selectedAgent.name}
                size="md"
                className="rounded-full"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {selectedAgent.name}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {[selectedAgent.providerName, selectedAgent.modelDisplayName]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <Button variant="ghost" size="sm" asChild>
                <Link href={`/agents/${selectedAgent.id}`}>
                  <ExternalLinkIcon className="size-3.5" aria-hidden="true" />
                  {t("openAgent")}
                </Link>
              </Button>
            </div>
          ) : null}
        </div>

        <div className="flex justify-end border-t border-border/60 pt-4">
          <Button
            onClick={() => void save()}
            disabled={saving || (agentId !== null && !selectedAgent)}
          >
            {saving ? <Spinner data-icon="inline-start" /> : null}
            {t("save")}
          </Button>
        </div>
      </div>
    </SettingsSection>
  );
}
