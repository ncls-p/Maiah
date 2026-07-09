"use client";

import { type SyntheticEvent, useRef, useState } from "react";
import { Link } from "@/i18n/navigation";
import { useRouter } from "@/i18n/navigation";
import { LogInIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { AuthShell } from "@/components/auth/auth-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldContent, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

export default function SignInPage() {
  const router = useRouter();
  const t = useTranslations("auth");
  const emailRef = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const errorId = "signin-error";

  async function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/sign-in/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message || t("signInFailed"));
      }

      router.push("/chat");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("signInFailed"));
      queueMicrotask(() => emailRef.current?.focus());
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title={t("signInTitle")}
      description={t("signInDescription")}
      footer={
        <>
          {t("noAccount")}{" "}
          <Link
            href="/auth/signup"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            {t("signUp")}
          </Link>
        </>
      }
    >
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-4"
        aria-busy={loading}
      >
        {error ? (
          <Alert id={errorId} variant="destructive">
            <AlertTitle>{t("signInErrorTitle")}</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <Field>
          <FieldLabel htmlFor="email">{t("email")}</FieldLabel>
          <FieldContent>
            <Input
              ref={emailRef}
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              spellCheck={false}
              required
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder={t("emailPlaceholder")}
            />
          </FieldContent>
        </Field>

        <Field>
          <FieldLabel htmlFor="password">{t("password")}</FieldLabel>
          <FieldContent>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={t("passwordPlaceholder")}
            />
          </FieldContent>
        </Field>

        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={loading}
          aria-busy={loading}
        >
          {loading ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <LogInIcon data-icon="inline-start" aria-hidden="true" />
          )}
          {loading ? t("signingIn") : t("signIn")}
        </Button>
      </form>
    </AuthShell>
  );
}
