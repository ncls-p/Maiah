"use client";
import {
  GenesysRecoveryPanel,
  type GenesysSessionSummary,
} from "./genesys-recovery-panel";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { fetchJson } from "@/lib/api-client";
import {
  GENESYS_REGIONS,
  type ConnectionInput,
} from "@/modules/genesys/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldDescription,
} from "@/components/ui/field";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { GovernanceSelect } from "./governance-select";

type Connection = Omit<ConnectionInput, "clientSecret" | "webhookSecret"> & {
  id: string;
  validatedAt: string | null;
  validationError: string | null;
};
const initial: ConnectionInput = {
  label: "Genesys Cloud",
  region: "mypurecloud.ie",
  clientId: "",
  integrationId: "",
  projectIds: [],
  enabled: true,
};
export function GenesysConnectionPanel({
  organizationId,
  projects,
}: {
  organizationId: string;
  projects: { id: string; name: string }[];
}) {
  const t = useTranslations("genesys");
  const [sessions, setSessions] = useState<GenesysSessionSummary[]>([]);
  const [draft, setDraft] = useState<ConnectionInput>(initial);
  const [saved, setSaved] = useState<Connection | null>(null);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);
  const endpoint = `/api/organizations/${organizationId}/genesys`;
  useEffect(() => {
    const controller = new AbortController();
    fetchJson<{
      sessions: GenesysSessionSummary[];
      connection: Connection | null;
      webhookUrl: string | null;
    }>(endpoint, { signal: controller.signal })
      .then((data) => {
        setSessions(data.sessions);
        setSaved(data.connection);
        setDraft(data.connection ?? initial);
        setWebhookUrl(data.webhookUrl ?? "");
        setLoading(false);
        setError("");
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
          setError(t("loadError"));
        }
      });
    return () => controller.abort();
  }, [endpoint, revision, t]);
  async function mutate(test: boolean) {
    if (pending) return;
    setPending(true);
    setError("");
    setNotice("");
    try {
      const result = await fetchJson<{ ok?: boolean; errorCode?: string }>(
        endpoint,
        {
          method: test ? "POST" : "PUT",
          headers: { "Content-Type": "application/json" },
          body: test ? undefined : JSON.stringify(draft),
        },
      );
      if (test && !result.ok) setNotice(t("testFailed"));
      else setNotice(t(test ? "testSuccess" : "saved"));
      setLoading(true);
      setRevision((v) => v + 1);
    } catch {
      setError(t("saveError"));
    } finally {
      setPending(false);
    }
  }
  return (
    <section
      className="flex flex-col gap-4 border-t pt-5"
      aria-label={t("title")}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold">{t("title")}</h3>
        {saved && (
          <Badge variant="secondary">
            {t(
              !saved.enabled
                ? "disabled"
                : saved.validatedAt
                  ? "ready"
                  : "notValidated",
            )}
          </Badge>
        )}
      </div>
      <p className="text-sm text-muted-foreground">{t("setupHint")}</p>
      {loading ? <p role="status">{t("loading")}</p> : null}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>
            {error}
            <Button
              variant="outline"
              onClick={() => {
                setLoading(true);
                setRevision((v) => v + 1);
              }}
            >
              {t("retry")}
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {notice && (
        <p role="status" className="text-sm">
          {notice}
        </p>
      )}
      {!loading && (!error || saved) && (
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void mutate(false);
          }}
        >
          <FieldGroup>
            {(
              [
                "label",
                "clientId",
                "integrationId",
                "clientSecret",
                "webhookSecret",
              ] as const
            ).map((key) => (
              <Field key={key}>
                <FieldLabel htmlFor={`genesys-${key}`}>{t(key)}</FieldLabel>
                <Input
                  id={`genesys-${key}`}
                  value={draft[key] ?? ""}
                  type={key.endsWith("Secret") ? "password" : "text"}
                  autoComplete="off"
                  required={!saved || !key.endsWith("Secret")}
                  disabled={pending}
                  minLength={key === "webhookSecret" ? 32 : undefined}
                  onChange={(event) =>
                    setDraft((d) => ({
                      ...d,
                      [key]: event.target.value || undefined,
                    }))
                  }
                />
                {saved && key.endsWith("Secret") && (
                  <FieldDescription>{t("keepSecret")}</FieldDescription>
                )}
              </Field>
            ))}
            <GovernanceSelect
              label={t("region")}
              value={draft.region}
              options={GENESYS_REGIONS.map((value) => ({
                id: value,
                name: value,
              }))}
              onChange={(value) =>
                setDraft((d) => ({
                  ...d,
                  region: value as ConnectionInput["region"],
                }))
              }
              disabled={pending}
            />
            <Field>
              <FieldLabel>{t("projects")}</FieldLabel>
              <FieldDescription>{t("projectsHint")}</FieldDescription>
              {projects.map((project) => (
                <label
                  key={project.id}
                  className="flex items-center gap-2 text-sm"
                >
                  <Checkbox
                    aria-label={project.name}
                    checked={draft.projectIds.includes(project.id)}
                    disabled={pending}
                    onCheckedChange={(checked) =>
                      setDraft((d) => ({
                        ...d,
                        projectIds: checked
                          ? [...d.projectIds, project.id]
                          : d.projectIds.filter((id) => id !== project.id),
                      }))
                    }
                  />
                  {project.name}
                </label>
              ))}
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                aria-label={t("enabled")}
                checked={draft.enabled}
                disabled={pending}
                onCheckedChange={(checked) =>
                  setDraft((d) => ({ ...d, enabled: checked === true }))
                }
              />
              {t("enabled")}
            </label>
          </FieldGroup>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={pending}>
              {t("save")}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={pending || !saved}
              onClick={() => void mutate(true)}
            >
              {t("test")}
            </Button>
          </div>
        </form>
      )}
      {saved && (
        <GenesysRecoveryPanel
          organizationId={organizationId}
          sessions={sessions}
          refresh={() => {
            setLoading(true);
            setRevision((v) => v + 1);
          }}
        />
      )}
      {webhookUrl && (
        <Field>
          <FieldLabel htmlFor="genesys-webhook">{t("webhook")}</FieldLabel>
          <Input id="genesys-webhook" readOnly value={webhookUrl} />
          <FieldDescription>{t("webhookHint")}</FieldDescription>
        </Field>
      )}
    </section>
  );
}
