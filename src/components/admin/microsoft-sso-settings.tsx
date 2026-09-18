"use client";

import { useEffect, useState, type SyntheticEvent } from "react";
import { useTranslations } from "next-intl";
import { KeyRoundIcon } from "lucide-react";
import { useSettingsOrganizationId } from "./organization-settings-context";
import { SettingsSection } from "./settings-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel, FieldDescription } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { fetchJson } from "@/lib/api-client";
import type { MicrosoftConfig } from "@/modules/auth/microsoft/config";

type Config = MicrosoftConfig & { hasClientSecret: boolean; approved: boolean };
type State = { config: Config | null; canApprove: boolean };

export function MicrosoftSsoSettings() {
  const t = useTranslations("microsoftSso");
  const organizationId = useSettingsOrganizationId();
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [revision, setRevision] = useState(0);
  const [form, setForm] = useState({
    enabled: false,
    clientId: "",
    tenantId: "",
    loginOrigin: "",
    domains: "",
    clientSecret: "",
  });
  const url = `/api/admin/microsoft-sso?organizationId=${organizationId}`;
  useEffect(() => {
    const controller = new AbortController();
    fetchJson<State>(url, { signal: controller.signal })
      .then((data) => {
        setState(data);
        setError("");
        const config = data.config;
        setForm({
          enabled: config?.enabled ?? false,
          clientId: config?.clientId ?? "",
          tenantId: config?.tenantId ?? "",
          loginOrigin: config?.loginOrigin ?? window.location.origin,
          domains: config?.emailDomains.join(", ") ?? "",
          clientSecret: "",
        });
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(error.message);
      });
    return () => controller.abort();
  }, [url, revision]);
  async function save(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setSaved(false);
    setError("");
    try {
      const data = await fetchJson<State>(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: form.enabled,
          clientId: form.clientId.trim(),
          tenantId: form.tenantId.trim(),
          loginOrigin: form.loginOrigin.trim().replace(/\/$/, ""),
          emailDomains: form.domains
            .split(",")
            .map((v) => v.trim())
            .filter(Boolean),
          ...(form.clientSecret ? { clientSecret: form.clientSecret } : {}),
        }),
      });
      setState(data);
      setForm((value) => ({ ...value, clientSecret: "" }));
      setSaved(true);
    } catch (error) {
      setError(error instanceof Error ? error.message : t("failed"));
    } finally {
      setSaving(false);
    }
  }
  return (
    <SettingsSection
      icon={KeyRoundIcon}
      title={t("title")}
      description={t("description")}
    >
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {!state ? (
        <Button
          variant="outline"
          onClick={() => setRevision((value) => value + 1)}
        >
          {error ? t("retry") : t("loading")}
        </Button>
      ) : (
        <form
          className="flex flex-col gap-5"
          onSubmit={save}
          aria-busy={saving}
        >
          <Field orientation="horizontal">
            <FieldLabel htmlFor="microsoft-enabled">{t("enabled")}</FieldLabel>
            <Switch
              id="microsoft-enabled"
              checked={form.enabled}
              disabled={saving}
              onCheckedChange={(enabled) => setForm((v) => ({ ...v, enabled }))}
            />
          </Field>
          <p className="text-sm text-muted-foreground">
            {state.config?.approved ? t("approved") : t("pending")}
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {(["clientId", "tenantId", "loginOrigin", "domains"] as const).map(
              (key) => (
                <Field key={key}>
                  <FieldLabel htmlFor={`microsoft-${key}`}>{t(key)}</FieldLabel>
                  <Input
                    id={`microsoft-${key}`}
                    value={form[key]}
                    required
                    disabled={saving}
                    autoComplete="off"
                    onChange={(event) =>
                      setForm((v) => ({ ...v, [key]: event.target.value }))
                    }
                  />
                </Field>
              ),
            )}
          </div>
          <Field>
            <FieldLabel htmlFor="microsoft-secret">{t("secret")}</FieldLabel>
            <Input
              id="microsoft-secret"
              type="password"
              value={form.clientSecret}
              disabled={saving}
              autoComplete="new-password"
              required={!state.config?.hasClientSecret}
              onChange={(event) =>
                setForm((v) => ({ ...v, clientSecret: event.target.value }))
              }
            />
            <FieldDescription>
              {state.config?.hasClientSecret
                ? t("secretSaved")
                : t("secretHelp")}
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="microsoft-callback">
              {t("callback")}
            </FieldLabel>
            <Input
              id="microsoft-callback"
              readOnly
              value={`${form.loginOrigin.replace(/\/$/, "")}/api/auth/callback/microsoft`}
            />
          </Field>
          <p className="text-sm text-muted-foreground">{t("accounts")}</p>
          {state.canApprove && (
            <p className="text-sm text-muted-foreground">{t("approvalHelp")}</p>
          )}
          {saved && <p role="status">{t("saved")}</p>}
          <Button type="submit" disabled={saving} className="self-start">
            {saving && <Spinner data-icon="inline-start" />}
            {state.canApprove ? t("saveApprove") : t("save")}
          </Button>
        </form>
      )}
    </SettingsSection>
  );
}
