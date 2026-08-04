"use client";

import { DatabaseZapIcon, SaveIcon } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import type { RagConfig } from "@/modules/knowledge/rag-config";

export function RagSettings({ initialState }: { initialState: RagConfig }) {
  const t = useTranslations("admin.settingsPage.rag");
  const [settings, setSettings] = useState(initialState);
  const [saving, setSaving] = useState(false);
  const configured = Boolean(settings.embedding.modelId);

  function numberValue(value: string, fallback: number) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  async function save() {
    setSaving(true);
    try {
      const response = await fetch("/api/admin/rag", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const data = (await response.json().catch(() => null)) as
        (RagConfig & { error?: string }) | null;
      if (!response.ok || !data)
        throw new Error(data?.error || t("saveFailed"));
      setSettings(data);
      toast.success(t("saved"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <SettingsSection
      icon={DatabaseZapIcon}
      title={t("title")}
      description={t("description")}
      badge={
        <SettingsStatusBadge
          label={configured ? t("statusConfigured") : t("statusFallback")}
          tone={configured ? "success" : "warning"}
        />
      }
    >
      <div className="grid gap-5">
        <div className="rounded-xl border border-border/60 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
          {t("simpleHint")}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="rag-embedding-model">{t("embeddingModel")}</Label>
            <Input
              id="rag-embedding-model"
              value={settings.embedding.modelId}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  embedding: {
                    ...settings.embedding,
                    modelId: event.target.value,
                  },
                })
              }
              placeholder={t("modelPlaceholder")}
            />
            <p className="text-xs text-muted-foreground">
              {t("autoProviderHint")}
            </p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="rag-dimensions">{t("dimensions")}</Label>
            <Input
              id="rag-dimensions"
              type="number"
              min={1}
              value={settings.embedding.dimensions ?? ""}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  embedding: {
                    ...settings.embedding,
                    dimensions: event.target.value
                      ? numberValue(event.target.value, 1)
                      : null,
                  },
                })
              }
              placeholder={t("dimensionsPlaceholder")}
            />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {(
            [
              ["chunkSize", "maxCharacters", settings.chunking.maxCharacters],
              [
                "chunkOverlap",
                "overlapCharacters",
                settings.chunking.overlapCharacters,
              ],
              [
                "candidates",
                "candidateCount",
                settings.retrieval.candidateCount,
              ],
              ["results", "resultCount", settings.retrieval.resultCount],
            ] as const
          ).map(([label, key, value]) => (
            <div className="grid gap-1.5" key={key}>
              <Label htmlFor={`rag-${key}`}>{t(label)}</Label>
              <Input
                id={`rag-${key}`}
                type="number"
                min={key === "overlapCharacters" ? 0 : 1}
                value={value}
                onChange={(event) => {
                  const next = numberValue(event.target.value, value);
                  setSettings(
                    key === "maxCharacters" || key === "overlapCharacters"
                      ? {
                          ...settings,
                          chunking: { ...settings.chunking, [key]: next },
                        }
                      : {
                          ...settings,
                          retrieval: { ...settings.retrieval, [key]: next },
                        },
                  );
                }}
              />
            </div>
          ))}
        </div>
        <div className="rounded-xl border bg-background p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="rag-reranking">{t("reranking")}</Label>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("rerankingHint")}
              </p>
            </div>
            <Switch
              id="rag-reranking"
              checked={settings.reranking.enabled}
              onCheckedChange={(enabled) =>
                setSettings({
                  ...settings,
                  reranking: { ...settings.reranking, enabled },
                })
              }
            />
          </div>
          {settings.reranking.enabled ? (
            <div className="mt-4 grid gap-1.5">
              <Label htmlFor="rag-reranking-model">{t("rerankingModel")}</Label>
              <Input
                id="rag-reranking-model"
                value={settings.reranking.modelId}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    reranking: {
                      ...settings.reranking,
                      modelId: event.target.value,
                    },
                  })
                }
                placeholder={t("modelPlaceholder")}
              />
            </div>
          ) : null}
        </div>
        <Button type="button" onClick={() => void save()} disabled={saving}>
          {saving ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <SaveIcon data-icon="inline-start" />
          )}
          {t("save")}
        </Button>
      </div>
    </SettingsSection>
  );
}
