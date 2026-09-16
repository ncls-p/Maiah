"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { BotIcon } from "lucide-react";
import { useSettingsOrganizationId } from "./organization-settings-context";
import { SettingsSection } from "./settings-panel";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ErrorDetailsButton } from "@/components/ui/error-details-button";
import { fetchJson } from "@/lib/api-client";
type State = {
  enabled: boolean;
  agentId: string | null;
  canEnable: boolean;
  availableAgents: { id: string; name: string }[];
};
export function CompanionSettings() {
  const organizationId = useSettingsOrganizationId();
  return (
    <OrganizationCompanionSettings
      key={organizationId}
      organizationId={organizationId}
    />
  );
}
function OrganizationCompanionSettings({
  organizationId,
}: {
  organizationId: string | null;
}) {
  const t = useTranslations("companion");
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    if (organizationId)
      void fetchJson<State>(
        `/api/companion/settings?organizationId=${organizationId}`,
        { signal: controller.signal },
      )
        .then((data) => {
          if (!controller.signal.aborted) {
            setState(data);
            setError("");
          }
        })
        .catch((cause) => {
          if (!controller.signal.aborted)
            setError(cause instanceof Error ? cause.message : t("loadError"));
        });
    return () => controller.abort();
  }, [organizationId, revision, t]);
  async function save() {
    if (!state || busy) return;
    setBusy(true);
    setError("");
    try {
      setState(
        await fetchJson<State>(
          `/api/companion/settings?organizationId=${organizationId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              agentId: state.agentId,
              ...(state.canEnable ? { enabled: state.enabled } : {}),
            }),
          },
        ),
      );
      window.dispatchEvent(new Event("maiah:companion-settings"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("loadError"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <SettingsSection
      icon={BotIcon}
      title={t("title")}
      description={t("settingsDescription")}
    >
      <div className="flex flex-col gap-4">
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>
              {error}
              <ErrorDetailsButton />
              <Button
                variant="outline"
                onClick={() => setRevision((value) => value + 1)}
              >
                {t("retry")}
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}
        {state ? (
          <>
            {state.canEnable ? (
              <div className="flex items-center justify-between gap-4">
                <Label htmlFor="companion-enabled">{t("globalEnable")}</Label>
                <Switch
                  id="companion-enabled"
                  checked={state.enabled}
                  disabled={busy}
                  onCheckedChange={(enabled) => setState({ ...state, enabled })}
                />
              </div>
            ) : !state.enabled ? (
              <p className="text-sm text-muted-foreground">
                {t("globallyDisabled")}
              </p>
            ) : null}
            <Label htmlFor="companion-agent">{t("assistant")}</Label>
            <Select
              value={state.agentId ?? "none"}
              disabled={busy}
              onValueChange={(agentId) =>
                setState({
                  ...state,
                  agentId: agentId === "none" ? null : agentId,
                })
              }
            >
              <SelectTrigger id="companion-agent">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="none">{t("disabled")}</SelectItem>
                  {state.availableAgents.map((agent) => (
                    <SelectItem key={agent.id} value={agent.id}>
                      {agent.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">{t("permissions")}</p>
            <Button onClick={() => void save()} disabled={busy}>
              {busy ? t("saving") : t("save")}
            </Button>
          </>
        ) : !error ? (
          <p role="status">{t("loading")}</p>
        ) : null}
      </div>
    </SettingsSection>
  );
}
