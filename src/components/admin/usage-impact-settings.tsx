"use client";

import { LeafIcon, RefreshCwIcon } from "lucide-react";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  SettingsSection,
  SettingsStatusBadge,
} from "@/components/admin/settings-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";

type UsageImpactState = {
  enabled: boolean;
  co2GramsPerKwh?: number;
};

type RefreshSummary = {
  totalProviders: number;
  refreshedProviders: number;
  failedProviders: number;
  importedModels: number;
};

export function UsageImpactSettings({
  initialState,
}: {
  initialState: UsageImpactState;
}) {
  const t = useTranslations("admin.settingsPage.usageImpact");
  const [settings, setSettings] = useState(initialState);
  const [co2GramsPerKwh, setCo2GramsPerKwh] = useState(
    initialState.co2GramsPerKwh?.toString() ?? "",
  );
  const [saving, setSaving] = useState(false);

  async function save(enabled: boolean) {
    setSaving(true);
    try {
      const parsedCarbonIntensity = co2GramsPerKwh.trim()
        ? Number(co2GramsPerKwh)
        : undefined;
      if (
        parsedCarbonIntensity !== undefined &&
        (!Number.isFinite(parsedCarbonIntensity) || parsedCarbonIntensity < 0)
      ) {
        throw new Error(t("invalidCarbonIntensity"));
      }
      const res = await fetch("/api/admin/usage-impact", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled,
          ...(parsedCarbonIntensity === undefined
            ? {}
            : { co2GramsPerKwh: parsedCarbonIntensity }),
        }),
      });
      const data = (await res.json().catch(() => null)) as
        | (UsageImpactState & { refresh?: RefreshSummary; error?: string })
        | null;
      if (!res.ok || !data) {
        throw new Error(data?.error || t("saveFailed"));
      }
      setSettings({
        enabled: data.enabled,
        co2GramsPerKwh: data.co2GramsPerKwh,
      });
      toast.success(
        data.enabled
          ? t("enabledToast", {
              providers: data.refresh?.refreshedProviders ?? 0,
              models: data.refresh?.importedModels ?? 0,
            })
          : t("disabledToast"),
      );
      if (data.refresh?.failedProviders) {
        toast.warning(
          t("partialRefresh", { count: data.refresh.failedProviders }),
        );
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <SettingsSection
      icon={LeafIcon}
      title={t("title")}
      description={t("description")}
      badge={
        <SettingsStatusBadge
          label={settings.enabled ? t("statusEnabled") : t("statusDisabled")}
          tone={settings.enabled ? "success" : "muted"}
        />
      }
    >
      <div className="flex flex-col gap-4">
        <p className="rounded-xl border border-border/60 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
          {t("sourcePriority")}
        </p>
        <div className="grid gap-1.5">
          <Label htmlFor="usage-impact-carbon-intensity">
            {t("carbonIntensity")}
          </Label>
          <Input
            id="usage-impact-carbon-intensity"
            type="number"
            min={0}
            step="any"
            inputMode="decimal"
            value={co2GramsPerKwh}
            onChange={(event) => setCo2GramsPerKwh(event.target.value)}
            placeholder={t("carbonIntensityPlaceholder")}
          />
          <p className="text-xs text-muted-foreground">
            {t("carbonIntensityHint")}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            onClick={() => void save(true)}
            disabled={saving}
            className="sm:flex-1"
          >
            {saving ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <RefreshCwIcon data-icon="inline-start" aria-hidden="true" />
            )}
            {settings.enabled ? t("refreshAndSave") : t("enable")}
          </Button>
          {settings.enabled ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => void save(false)}
              disabled={saving}
              className="sm:flex-1"
            >
              {t("disable")}
            </Button>
          ) : null}
        </div>
      </div>
    </SettingsSection>
  );
}
