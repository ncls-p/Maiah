"use client";

import { useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/lib/toast";

export function SetUserPasswordDialog({
  userId,
  name,
  email,
  onClose,
}: {
  userId: string;
  name: string;
  email: string;
  onClose: () => void;
}) {
  const t = useTranslations("access.passwordReset");
  const id = useId();
  const submitting = useRef(false);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mismatch = confirmation.length > 0 && password !== confirmation;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      submitting.current ||
      password.length < 8 ||
      password.length > 128 ||
      password !== confirmation
    )
      return;
    submitting.current = true;
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/admin/set-user-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, newPassword: password }),
      });
      if (!response.ok) throw new Error("password_update_failed");
      setPassword("");
      setConfirmation("");
      toast.success(t("success"));
      onClose();
    } catch {
      setError(t("error"));
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !submitting.current) onClose();
      }}
    >
      <DialogContent showCloseButton={!pending}>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>
            {t("description", { name, email })}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-6">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={`${id}-password`}>
                {t("newPassword")}
              </FieldLabel>
              <Input
                id={`${id}-password`}
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                maxLength={128}
                value={password}
                disabled={pending}
                onChange={(event) => setPassword(event.target.value)}
                aria-describedby={`${id}-hint`}
              />
              <FieldDescription id={`${id}-hint`}>{t("hint")}</FieldDescription>
            </Field>
            <Field data-invalid={mismatch}>
              <FieldLabel htmlFor={`${id}-confirmation`}>
                {t("confirmation")}
              </FieldLabel>
              <Input
                id={`${id}-confirmation`}
                type="password"
                autoComplete="new-password"
                required
                maxLength={128}
                value={confirmation}
                disabled={pending}
                onChange={(event) => setConfirmation(event.target.value)}
                aria-invalid={mismatch}
                aria-describedby={mismatch ? `${id}-mismatch` : undefined}
              />
              {mismatch ? (
                <FieldDescription id={`${id}-mismatch`}>
                  {t("mismatch")}
                </FieldDescription>
              ) : null}
            </Field>
          </FieldGroup>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={onClose}
            >
              {t("cancel")}
            </Button>
            <Button
              type="submit"
              disabled={
                pending || password.length < 8 || password !== confirmation
              }
            >
              {pending ? <Spinner /> : null}
              {t("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
