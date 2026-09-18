"use client";

import { BotIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ErrorDetailsButton } from "@/components/ui/error-details-button";
import { fetchJson } from "@/lib/api-client";

export function SettingsCompanionCard() {
  const t = useTranslations("settings");
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void fetchJson<{ userEnabled: boolean }>("/api/companion", {
      signal: controller.signal,
    })
      .then((data) => {
        if (controller.signal.aborted) return;
        setEnabled(data.userEnabled);
        setError("");
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error ? cause.message : t("companionLoadFailed"),
          );
      });
    return () => controller.abort();
  }, [revision, t]);

  async function save(userEnabled: boolean) {
    if (busy || enabled === null) return;
    const previous = enabled;
    setBusy(true);
    setEnabled(userEnabled);
    setError("");
    try {
      await fetchJson("/api/companion", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userEnabled }),
      });
      window.dispatchEvent(new Event("maiah:companion-settings"));
    } catch (cause) {
      setEnabled(previous);
      setError(
        cause instanceof Error ? cause.message : t("companionSaveFailed"),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <BotIcon
            className="size-4 text-muted-foreground"
            aria-hidden="true"
          />
          {t("companionTitle")}
        </CardTitle>
        <CardDescription>{t("companionDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>
              {error}
              <ErrorDetailsButton />
              <Button
                variant="outline"
                onClick={() => setRevision((value) => value + 1)}
              >
                {t("companionRetry")}
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}
        {enabled === null && !error ? (
          <p role="status">{t("companionLoading")}</p>
        ) : enabled !== null ? (
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <Label htmlFor="companion-user-enabled">
                {t("companionEnable")}
              </Label>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("companionHint")}
              </p>
            </div>
            <Switch
              id="companion-user-enabled"
              checked={enabled}
              disabled={busy}
              onCheckedChange={(value) => void save(value)}
            />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
