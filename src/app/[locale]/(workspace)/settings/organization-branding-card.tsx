"use client";

import {
  ImageIcon,
  PaletteIcon,
  RotateCcwIcon,
  UploadIcon,
} from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useWorkspace } from "@/hooks/use-workspace";
import { cn } from "@/lib/utils";
import type { OrganizationTheme } from "@/modules/organization/branding";

type Branding = {
  organizationName: string;
  logoUrl: string | null;
  theme: OrganizationTheme;
  canManage: boolean;
};

const themes: Array<{
  id: OrganizationTheme;
  colors: [string, string, string];
}> = [
  { id: "ocean", colors: ["#0f7f94", "#25adc5", "#e8f7f9"] },
  { id: "forest", colors: ["#28765a", "#62a96f", "#edf8ef"] },
  { id: "ember", colors: ["#bd4b20", "#db8b2c", "#fff2e6"] },
  { id: "violet", colors: ["#6945a4", "#b2579a", "#f4eefb"] },
  { id: "slate", colors: ["#435366", "#74869a", "#eef1f4"] },
];

async function readLogo(file: File) {
  if (!/^image\/(png|jpeg|webp|gif|avif)$/.test(file.type)) {
    throw new Error("invalid_type");
  }
  if (file.size > 256 * 1024) throw new Error("too_large");
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("read_failed"));
    reader.readAsDataURL(file);
  });
}

export function OrganizationBrandingCard() {
  const t = useTranslations("settings.branding");
  const { workspaceId, refresh } = useWorkspace();
  const inputRef = useRef<HTMLInputElement>(null);
  const [branding, setBranding] = useState<Branding | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [theme, setTheme] = useState<OrganizationTheme>("ocean");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!workspaceId) return;
    const controller = new AbortController();
    void fetch(`/api/workspace/branding?workspaceId=${workspaceId}`, {
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error("load_failed");
        return response.json() as Promise<Branding>;
      })
      .then((data) => {
        setBranding(data);
        setLogoUrl(data.logoUrl);
        setTheme(data.theme);
      })
      .catch((error: Error) => {
        if (error.name !== "AbortError") toast.error(t("loadFailed"));
      });
    return () => controller.abort();
  }, [t, workspaceId]);

  async function onFile(file: File | undefined) {
    if (!file) return;
    try {
      setLogoUrl(await readLogo(file));
    } catch (error) {
      const code = error instanceof Error ? error.message : "read_failed";
      toast.error(
        t(
          code === "too_large"
            ? "logoTooLarge"
            : code === "invalid_type"
              ? "logoInvalid"
              : "logoReadFailed",
        ),
      );
    }
  }

  async function save() {
    if (!workspaceId || !branding?.canManage) return;
    setSaving(true);
    try {
      const response = await fetch("/api/workspace/branding", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId, logoUrl, theme }),
      });
      if (!response.ok) throw new Error("save_failed");
      document.documentElement.dataset.brandTheme = theme;
      await refresh();
      setBranding({ ...branding, logoUrl, theme });
      toast.success(t("saved"));
    } catch {
      toast.error(t("saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  if (!branding) return <Skeleton className="h-80 rounded-2xl" />;
  const dirty = logoUrl !== branding.logoUrl || theme !== branding.theme;
  return (
    <section className="overflow-hidden rounded-2xl border bg-card shadow-[var(--surface-shadow)]">
      <div className="border-b px-5 py-5 sm:px-6">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <PaletteIcon className="size-4 text-primary" aria-hidden="true" />
          {t("title")}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("description", { organization: branding.organizationName })}
        </p>
      </div>
      <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[14rem_1fr]">
        <div>
          <Label>{t("logo")}</Label>
          <button
            type="button"
            disabled={!branding.canManage}
            onClick={() => inputRef.current?.click()}
            className="mt-2 grid h-28 w-full place-items-center overflow-hidden rounded-xl border border-dashed bg-muted/25 transition-colors hover:border-primary/50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {logoUrl ? (
              <Image
                src={logoUrl}
                alt={branding.organizationName}
                width={180}
                height={72}
                unoptimized
                className="max-h-16 w-auto max-w-[11rem] object-contain"
              />
            ) : (
              <span className="flex flex-col items-center gap-2 text-xs text-muted-foreground">
                <ImageIcon className="size-6" aria-hidden="true" />
                {t("logoEmpty")}
              </span>
            )}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
            className="sr-only"
            onChange={(event) => void onFile(event.target.files?.[0])}
          />
          {branding.canManage ? (
            <div className="mt-2 flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => inputRef.current?.click()}
              >
                <UploadIcon className="size-4" aria-hidden="true" />
                {t("chooseLogo")}
              </Button>
              {logoUrl ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setLogoUrl(null)}
                >
                  {t("removeLogo")}
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
        <div>
          <Label>{t("theme")}</Label>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {themes.map((preset) => (
              <ThemeChoice
                key={preset.id}
                preset={preset}
                selected={theme === preset.id}
                disabled={!branding.canManage}
                label={t(`themes.${preset.id}`)}
                onSelect={() => setTheme(preset.id)}
              />
            ))}
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 border-t bg-muted/20 px-5 py-4 sm:px-6">
        <p className="text-xs text-muted-foreground">
          {branding.canManage ? t("scopeHint") : t("readOnly")}
        </p>
        {branding.canManage ? (
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={!dirty || saving}
              onClick={() => {
                setLogoUrl(branding.logoUrl);
                setTheme(branding.theme);
              }}
            >
              <RotateCcwIcon className="size-4" aria-hidden="true" />
              {t("reset")}
            </Button>
            <Button disabled={!dirty || saving} onClick={() => void save()}>
              {saving ? t("saving") : t("save")}
            </Button>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function ThemeChoice(props: {
  preset: (typeof themes)[number];
  selected: boolean;
  disabled: boolean;
  label: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      disabled={props.disabled}
      onClick={props.onSelect}
      aria-pressed={props.selected}
      className={cn(
        "rounded-xl border p-3 text-left transition-[border-color,box-shadow,transform] hover:-translate-y-px",
        props.selected
          ? "border-primary ring-2 ring-primary/15"
          : "border-border",
        props.disabled && "cursor-not-allowed opacity-60",
      )}
    >
      <span className="mb-2 flex h-8 overflow-hidden rounded-lg border">
        {props.preset.colors.map((color) => (
          <i
            key={color}
            className="flex-1"
            style={{ backgroundColor: color }}
          />
        ))}
      </span>
      <span className="text-sm font-medium">{props.label}</span>
    </button>
  );
}
