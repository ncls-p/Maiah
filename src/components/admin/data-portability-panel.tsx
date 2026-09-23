"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";

// Mirrors readPortabilityRequest: length-prefixed JSON fields, then the raw archive.
function portabilityBody(fields: Record<string, string>, archive?: File) {
  const json = new TextEncoder().encode(JSON.stringify(fields));
  const length = new Uint8Array(4);
  new DataView(length.buffer).setUint32(0, json.length);
  return new Blob(archive ? [length, json, archive] : [length, json]);
}
type Preview = {
  confirmation: string;
  rows: number;
  objects: number;
  objectBytes: number;
  tables: Record<string, number>;
  scope: { type: string; organizationId?: string };
};
export function DataPortabilityPanel({
  organizationId,
}: {
  organizationId?: string;
}) {
  const t = useTranslations("admin.portability");
  const id = useId();
  const [passphrase, setPassphrase] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  async function run(action: "export" | "preview" | "import") {
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const fields: Record<string, string> = { action, passphrase };
      if (organizationId) fields.organizationId = organizationId;
      if (action === "import" && preview) {
        fields.confirmation = preview.confirmation;
        fields.acknowledgement = confirmation;
      }
      const response = await fetch("/api/admin/data-portability", {
        method: "POST",
        headers: { "Content-Type": "application/vnd.maiah.portability" },
        body: portabilityBody(
          fields,
          file && action !== "export" ? file : undefined,
        ),
      });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || t("failed"));
      }
      if (action === "export") {
        const url = URL.createObjectURL(await response.blob());
        const link = document.createElement("a");
        link.href = url;
        link.download = `maiah-${organizationId ?? "instance"}.maiah`;
        document.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
        setStatus(t("exported"));
      } else if (action === "preview") {
        setPreview(await response.json());
        setConfirmation("");
      } else {
        setPreview(null);
        setPassphrase("");
        setConfirmation("");
        setStatus(t("imported"));
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t("failed"));
      if (action !== "export") setPreview(null);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card aria-busy={busy}>
      <CardHeader>
        <CardTitle>
          {t(organizationId ? "organizationTitle" : "title")}
        </CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <Alert>
          <AlertTitle>{t("sensitiveTitle")}</AlertTitle>
          <AlertDescription>{t("sensitive")}</AlertDescription>
        </Alert>
        <p className="text-sm text-muted-foreground">{t("maintenance")}</p>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor={`${id}-passphrase`}>
              {t("passphrase")}
            </FieldLabel>
            <Input
              id={`${id}-passphrase`}
              type="password"
              autoComplete="new-password"
              minLength={16}
              maxLength={1024}
              value={passphrase}
              disabled={busy}
              onChange={(event) => {
                setPassphrase(event.target.value);
                setPreview(null);
              }}
            />
            <FieldDescription>{t("passwordHelp")}</FieldDescription>
          </Field>
          <Button
            className="self-start"
            disabled={busy || passphrase.length < 16}
            onClick={() => run("export")}
          >
            {t("export")}
          </Button>
          <Field>
            <FieldLabel htmlFor={`${id}-file`}>{t("archive")}</FieldLabel>
            <Input
              id={`${id}-file`}
              type="file"
              accept=".maiah"
              disabled={busy}
              onChange={(event) => {
                setPreview(null);
                const selected = event.target.files?.[0] ?? null;
                if (selected && selected.size > 128 * 1024 * 1024) {
                  setFile(null);
                  setError(t("tooLarge"));
                } else {
                  setFile(selected);
                  setError("");
                }
              }}
            />
            <FieldDescription>{t("importHelp")}</FieldDescription>
          </Field>
          <Button
            variant="outline"
            className="self-start"
            disabled={busy || !file || passphrase.length < 16}
            onClick={() => run("preview")}
          >
            {t("preview")}
          </Button>
        </FieldGroup>
        {preview && (
          <section className="flex flex-col gap-4" aria-label={t("inventory")}>
            <p role="status">
              {t("counts", { rows: preview.rows, files: preview.objects })}
            </p>
            <p className="text-sm text-muted-foreground">
              {t("source")}: {preview.scope.organizationId ?? t("instance")}
            </p>
            <details>
              <summary className="cursor-pointer text-sm font-medium">
                {t("inventory")}
              </summary>
              <dl className="mt-3 grid max-h-64 grid-cols-[1fr_auto] gap-x-4 gap-y-1 overflow-auto text-sm">
                {Object.entries(preview.tables).map(([name, count]) => (
                  <div key={name} className="contents">
                    <dt className="break-all">{name}</dt>
                    <dd className="tabular-nums">{count}</dd>
                  </div>
                ))}
              </dl>
            </details>
            <Field>
              <FieldLabel htmlFor={`${id}-confirm`}>
                {t("confirmLabel")}
              </FieldLabel>
              <Input
                id={`${id}-confirm`}
                disabled={busy}
                value={confirmation}
                autoComplete="off"
                onChange={(event) => setConfirmation(event.target.value)}
              />
            </Field>
            <Button
              className="self-start"
              disabled={busy || confirmation !== "IMPORT"}
              onClick={() => run("import")}
            >
              {t("import")}
            </Button>
          </section>
        )}
        {error && (
          <Alert variant="destructive">
            <AlertTitle>{t("failed")}</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </CardContent>
      <CardFooter>
        <p
          role="status"
          aria-live="polite"
          className="text-sm text-muted-foreground"
        >
          {busy ? t("working") : status || t("limits")}
        </p>
      </CardFooter>
    </Card>
  );
}
