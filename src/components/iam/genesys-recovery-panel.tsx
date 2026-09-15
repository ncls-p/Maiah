"use client";
import type { HandoffState } from "@/modules/genesys/contracts";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { fetchJson } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel, FieldDescription } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
export type GenesysSessionSummary = {
  id: string;
  state: HandoffState;
  errorCode: string | null;
  externalConversationId: string | null;
};
export function GenesysRecoveryPanel({
  organizationId,
  sessions,
  refresh,
}: {
  organizationId: string;
  sessions: GenesysSessionSummary[];
  refresh: () => void;
}) {
  const t = useTranslations("genesys");
  const [externalId, setExternalId] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  async function reconcile(sessionId: string) {
    if (pending) return;
    setPending(true);
    setError(false);
    try {
      await fetchJson(`/api/organizations/${organizationId}/genesys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reconcile",
          sessionId,
          externalConversationId: externalId[sessionId],
        }),
      });
      refresh();
    } catch {
      setError(true);
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="flex flex-col gap-3" aria-label={t("recovery")}>
      <Button
        variant="outline"
        type="button"
        disabled={pending}
        onClick={refresh}
      >
        {t("refreshTransfers")}
      </Button>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{t("recoveryError")}</AlertDescription>
        </Alert>
      )}
      {sessions.map((session) => (
        <div
          key={session.id}
          className="flex flex-col gap-2 rounded-md border p-3"
        >
          <p className="break-all text-sm">
            {session.id} · {t(`states.${session.state}`)}
          </p>
          {session.externalConversationId && (
            <p className="break-all text-sm">
              Genesys: {session.externalConversationId}
            </p>
          )}
          {session.state === "uncertain" && !session.externalConversationId && (
            <form
              className="flex flex-col gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                void reconcile(session.id);
              }}
            >
              <Field>
                <FieldLabel htmlFor={`genesys-recovery-${session.id}`}>
                  {t("externalConversationId")}
                </FieldLabel>
                <Input
                  id={`genesys-recovery-${session.id}`}
                  required
                  disabled={pending}
                  value={externalId[session.id] ?? ""}
                  onChange={(event) =>
                    setExternalId((d) => ({
                      ...d,
                      [session.id]: event.target.value,
                    }))
                  }
                />
                <FieldDescription>{t("recoveryHint")}</FieldDescription>
              </Field>
              <Button type="submit" disabled={pending}>
                {t("reconcile")}
              </Button>
            </form>
          )}
        </div>
      ))}
    </section>
  );
}
