"use client";
import { useEffect, useState, type SyntheticEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

export function MicrosoftSignIn() {
  const t = useTranslations("microsoftSso");
  const locale = useLocale();
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
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
    setLoading(true);
    try {
      const response = await fetch("/api/auth/microsoft/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), locale }),
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
    <div className="mt-4 flex flex-col gap-3">
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!loading) {
            setOpen(value);
            setError("");
          }
        }}
      >
        <DialogTrigger asChild>
          <Button type="button" variant="outline" size="lg" className="w-full">
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
            {t("signIn")}
          </Button>
        </DialogTrigger>
        <DialogContent showCloseButton={!loading}>
          <DialogHeader>
            <DialogTitle>{t("signIn")}</DialogTitle>
            <DialogDescription>{t("emailHint")}</DialogDescription>
          </DialogHeader>
          <form
            id="microsoft-signin"
            onSubmit={signIn}
            className="flex flex-col gap-4"
            aria-busy={loading}
          >
            <Field>
              <FieldLabel htmlFor="microsoft-email">
                {t("emailLabel")}
              </FieldLabel>
              <Input
                id="microsoft-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                autoFocus
                onChange={(event) => setEmail(event.target.value)}
                disabled={loading}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? "microsoft-error" : undefined}
              />
            </Field>
            {error && (
              <Alert variant="destructive" id="microsoft-error">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </form>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={loading}
              onClick={() => setOpen(false)}
            >
              {t("cancel")}
            </Button>
            <Button type="submit" form="microsoft-signin" disabled={loading}>
              {loading && <Spinner data-icon="inline-start" />}
              {t("continue")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {!open && error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
