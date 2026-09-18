"use client";
import { useEffect, useState, type SyntheticEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";

export function MicrosoftSignIn({ email }: { email: string }) {
  const t = useTranslations("microsoftSso");
  const locale = useLocale();
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [workEmail, setWorkEmail] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("microsoftError")) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- display the OAuth callback error without a Suspense boundary
      setError(t("signInFailed"));
    }
  }, [t]);
  async function signIn(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!workEmail.trim()) {
      setError(t("emailRequired"));
      document.getElementById("microsoft-email")?.focus();
      return;
    }
    setLoading(true);
    try {
      const response = await fetch("/api/auth/microsoft/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: workEmail.trim(), locale }),
      });
      if (!response.ok) throw new Error(t("unavailable"));
      const data = await response.json();
      window.location.assign(data.url);
    } catch (error) {
      setError(error instanceof Error ? error.message : t("signInFailed"));
      setLoading(false);
    }
  }
  return (
    <form className="mt-4 flex flex-col gap-3" onSubmit={signIn}>
      {expanded && (
        <Field>
          <FieldLabel htmlFor="microsoft-email">{t("emailLabel")}</FieldLabel>
          <Input
            id="microsoft-email"
            type="email"
            autoComplete="email"
            required
            autoFocus
            value={workEmail}
            onChange={(event) => setWorkEmail(event.target.value)}
            disabled={loading}
          />
        </Field>
      )}
      <Button
        type={expanded ? "submit" : "button"}
        variant="outline"
        size="lg"
        disabled={loading}
        onClick={
          expanded
            ? undefined
            : (event) => {
                event.preventDefault();
                setWorkEmail(email);
                setExpanded(true);
              }
        }
      >
        {loading ? (
          <Spinner data-icon="inline-start" />
        ) : (
          <svg
            data-icon="inline-start"
            aria-hidden="true"
            viewBox="0 0 21 21"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path fill="#f25022" d="M1 1h9v9H1z" />
            <path fill="#7fba00" d="M11 1h9v9h-9z" />
            <path fill="#00a4ef" d="M1 11h9v9H1z" />
            <path fill="#ffb900" d="M11 11h9v9h-9z" />
          </svg>
        )}
        {t("signIn")}
      </Button>
      {expanded && (
        <p className="text-sm text-muted-foreground">{t("emailHint")}</p>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </form>
  );
}
