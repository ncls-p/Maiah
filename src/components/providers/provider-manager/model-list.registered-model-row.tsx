import {
  ImagePlusIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { AdvancedSection } from "@/components/ui/advanced-section";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import { ModelLogo } from "@/components/providers/model-logo";
import { ModelConfigDialog } from "./model-config-dialog";
import { ModelCapabilities } from "./provider-shared";
import type {
  DiscoveredModel,
  ProviderModel,
  ProviderModelUpdate,
  SafeProvider,
} from "./types";
import { readLogoFile } from "./model-list.read-logo-file";


export function RegisteredModelRow({
  model,
  busy,
  onUpdateModelLogo,
  onUpdateModel,
  onDeleteModel,
}: {
  model: ProviderModel;
  busy: boolean;
  onUpdateModelLogo: (modelId: string, logoUrl: string | null) => void;
  onUpdateModel: (modelId: string, update: ProviderModelUpdate) => void;
  onDeleteModel: (modelId: string) => void;
}) {
  const t = useTranslations("providers.manager");
  const modelLabel = model.displayName || model.modelId;
  const [editing, setEditing] = useState(false);

  async function handleLogoChange(file: File | undefined) {
    if (!file) return;
    try {
      onUpdateModelLogo(model.id, await readLogoFile(file));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Invalid image file",
      );
    }
  }

  return (
    <div className="group flex items-start justify-between gap-3 px-3 py-2.5 transition-colors hover:bg-muted/30">
      <div className="flex min-w-0 items-start gap-3">
        <ModelLogo logoUrl={model.logoUrl} label={modelLabel} size="lg" />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{modelLabel}</p>
          <p className="truncate font-mono text-xs text-muted-foreground">
            {model.modelId}
          </p>
          <ModelCapabilities
            capabilities={model.capabilitiesJson}
            contextWindow={model.contextWindow}
            maxOutputTokens={model.maxOutputTokens}
            inputTokenCost={model.inputTokenCost}
            outputTokenCost={model.outputTokenCost}
            enabled={model.enabled}
          />
          <div className="mt-1 flex flex-wrap gap-1 text-[10px] text-muted-foreground">
            {model.imageGenerationConfigJson?.enabled ||
            model.capabilitiesJson?.imageGeneration ? (
              <span className="rounded bg-muted px-1.5 py-0.5">
                {t("imageGeneration")}
                {model.imageGenerationConfigJson?.isDefault
                  ? ` · ${t("defaultImageModel")}`
                  : ""}
              </span>
            ) : null}
            {model.sustainabilityConfigJson?.energyKwhPerMillionTokens !==
            undefined ? (
              <span className="rounded bg-muted px-1.5 py-0.5">
                {model.sustainabilityConfigJson.energyKwhPerMillionTokens} kWh/M
                tokens
              </span>
            ) : null}
            {model.sustainabilityConfigJson?.co2GramsPerMillionTokens !==
            undefined ? (
              <span className="rounded bg-muted px-1.5 py-0.5">
                {model.sustainabilityConfigJson.co2GramsPerMillionTokens}{" "}
                gCO₂e/M tokens
              </span>
            ) : null}
          </div>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label={t("editModel")}
          disabled={busy}
          onClick={() => setEditing(true)}
        >
          <PencilIcon className="size-3.5" aria-hidden="true" />
        </Button>
        <input
          id={`model-logo-${model.id}`}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/avif,image/bmp,image/x-icon,image/*"
          className="sr-only"
          disabled={busy}
          onChange={(event) => {
            void handleLogoChange(event.currentTarget.files?.[0]);
            event.currentTarget.value = "";
          }}
        />
        <Button size="icon-xs" variant="ghost" asChild>
          <label
            htmlFor={`model-logo-${model.id}`}
            aria-label={t("assignModelLogo")}
            aria-disabled={busy}
            className={cn(
              "cursor-pointer",
              busy && "pointer-events-none opacity-45",
            )}
          >
            <ImagePlusIcon className="size-3.5" aria-hidden="true" />
          </label>
        </Button>
        {model.logoUrl ? (
          <Button
            size="icon-xs"
            variant="ghost"
            disabled={busy}
            aria-label={t("removeModelLogo")}
            onClick={() => onUpdateModelLogo(model.id, null)}
          >
            <XIcon className="size-3.5" aria-hidden="true" />
          </Button>
        ) : null}
        <Button
          size="xs"
          variant="ghost"
          aria-label={t("removeModel")}
          disabled={busy}
          onClick={() => onDeleteModel(model.id)}
        >
          <Trash2Icon data-icon="inline-start" aria-hidden="true" />
          {t("remove")}
        </Button>
      </div>
      <ModelConfigDialog
        key={`${model.id}:${editing}`}
        model={model}
        open={editing}
        busy={busy}
        onOpenChange={setEditing}
        onSave={(update) => {
          onUpdateModel(model.id, update);
          setEditing(false);
        }}
      />
    </div>
  );
}
