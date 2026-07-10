"use client";

import { type SyntheticEvent, useEffect, useRef, useState } from "react";
import { Link } from "@/i18n/navigation";
import { useRouter } from "@/i18n/navigation";
import { UserPlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { AuthShell } from "@/components/auth/auth-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldContent, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

export default function SignUpPage() {
  const router = useRouter();
  const t = useTranslations("auth");
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [registrationClosed, setRegistrationClosed] = useState(false);
  const errorId = "signup-error";
  const passwordRequirementsId = "signup-password-requirements";

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      void fetch("/api/admin/settings")
        .then((res) => res.json())
        .then((data) => {
          if (!cancelled) setRegistrationClosed(data.canPublicSignUp === false);
        })
        .catch(() => {
          if (!cancelled) setRegistrationClosed(false);
        });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (registrationClosed) return;
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/sign-up/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message || t("signUpFailed"));
      }

      router.push("/chat");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("signUpFailed"));
      queueMicrotask(() => nameRef.current?.focus());
      return;
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title={registrationClosed ? t("registrationClosed") : t("signUpTitle")}
      description={
        registrationClosed
          ? t("registrationClosedDescription")
          : t("signUpDescription")
      }
      footer={
        <>
          {t("haveAccount")}{" "}
          <Link
            href="/auth/signin"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            {t("signIn")}
          </Link>
        </>
      }
    >
      {registrationClosed ? (
        <Button asChild className="w-full" size="lg">
          <Link href="/auth/signin">{t("goToSignIn")}</Link>
        </Button>
      ) : (
        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-4"
          aria-busy={loading}
        >
          {error ? (
            <Alert id={errorId} variant="destructive">
              <AlertTitle>{t("signUpErrorTitle")}</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <Field>
            <FieldLabel htmlFor="name">{t("fullName")}</FieldLabel>
            <FieldContent>
              <Input
                ref={nameRef}
                id="name"
                name="name"
                type="text"
                autoComplete="name"
                required
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? errorId : undefined}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={t("namePlaceholder")}
              />
            </FieldContent>
          </Field>

          <Field>
            <FieldLabel htmlFor="email">{t("email")}</FieldLabel>
            <FieldContent>
              <Input
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
                autoComplete="new-password"
                required
                minLength={8}
                aria-invalid={error ? true : undefined}
                aria-describedby={
                  error
                    ? `${passwordRequirementsId} ${errorId}`
                    : passwordRequirementsId
                }
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={t("newPasswordPlaceholder")}
              />
              <p
                id={passwordRequirementsId}
                className="text-xs text-muted-foreground"
              >
                {t("passwordRequirements")}
              </p>
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
              <UserPlusIcon data-icon="inline-start" aria-hidden="true" />
            )}
            {loading ? t("creatingAccount") : t("createAccount")}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
