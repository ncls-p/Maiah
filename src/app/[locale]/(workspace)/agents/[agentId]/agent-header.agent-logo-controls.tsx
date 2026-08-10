"use client";

import {
  CheckCircle2Icon,
  ClockIcon,
  ImagePlusIcon,
  NetworkIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { ModelLogo } from "@/components/providers/model-logo";
import { ResourceProvenanceBadge } from "@/components/resource-provenance-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import type { Agent } from "./types";

const MAX_LOGO_BYTES = 256 * 1024;

function readLogoFile(
  file: File,
  messages: { invalid: string; tooLarge: string; readFailed: string },
) {
  return new Promise<string>((resolve, reject) => {
    if (!file.type.startsWith("image/") || file.type === "image/svg+xml") {
      reject(new Error(messages.invalid));
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      reject(new Error(messages.tooLarge));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(messages.readFailed));
    reader.readAsDataURL(file);
  });
}

export function AgentLogoControls({
  agent,
  agentLabel,
  canEdit,
  onLogoChange,
}: {
  agent: Agent | null;
  agentLabel: string;
  canEdit: boolean;
  onLogoChange: (logoUrl: string | null) => void;
}) {
  const t = useTranslations("agents.configurePage");

  async function handleLogoFile(file: File | undefined) {
    if (!file) return;
    try {
      onLogoChange(
        await readLogoFile(file, {
          invalid: t("logoInvalid"),
          tooLarge: t("logoTooLarge"),
          readFailed: t("logoReadFailed"),
        }),
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("logoInvalid"));
    }
  }

  return (
    <div className="relative flex size-12 shrink-0 items-center justify-center">
      <ModelLogo
        logoUrl={agent?.logoUrl}
        label={agentLabel}
        size="lg"
        imageFit="cover"
        className="rounded-full ring-1 ring-border/70"
      />
      {canEdit && agent?.id ? (
        <>
          <input
            id={`agent-logo-${agent.id}`}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,image/avif,image/bmp,image/x-icon,image/*"
            className="sr-only"
            onChange={(event) => {
              void handleLogoFile(event.currentTarget.files?.[0]);
              event.currentTarget.value = "";
            }}
          />
          <Button
            size="icon-sm"
            variant="outline"
            className="absolute -right-1 -bottom-1 size-7 rounded-full bg-background shadow-sm"
            asChild
          >
            <label
              htmlFor={`agent-logo-${agent.id}`}
              aria-label={t("changeLogo")}
              className="cursor-pointer"
            >
              <ImagePlusIcon className="size-3.5" aria-hidden="true" />
            </label>
          </Button>
        </>
      ) : null}
    </div>
  );
}

export function AgentHeaderTitle({
  agent,
  hasModel,
  providerName,
  modelLabel,
  t,
}: {
  agent: Agent | null;
  hasModel: boolean;
  providerName?: string;
  modelLabel?: string;
  t: ReturnType<typeof useTranslations<"agents">>;
}) {
  return (
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-2">
        {hasModel ? (
          <Badge
            variant="outline"
            className="gap-1 border-success/30 bg-success/10 text-success"
          >
            <CheckCircle2Icon className="size-3" aria-hidden="true" />
            {t("statusReady")}
          </Badge>
        ) : (
          <Badge variant="outline" className="gap-1">
            <ClockIcon className="size-3" aria-hidden="true" />
            {t("statusMissingModel")}
          </Badge>
        )}
        {agent?.kind === "orchestrator" ? (
          <Badge variant="secondary" className="gap-1">
            <NetworkIcon className="size-3" aria-hidden="true" />
            {t("list.kindOrchestrator")}
          </Badge>
        ) : null}
        {agent?.provenance ? (
          <ResourceProvenanceBadge provenance={agent.provenance} />
        ) : null}
      </div>
      {hasModel ? (
        <p className="mt-1.5 text-xs text-muted-foreground">
          {providerName || t("configurePage.modelConfigured")}
          {modelLabel ? (
            <span className="ml-1 opacity-70">· {modelLabel}</span>
          ) : null}
        </p>
      ) : agent?.description ? (
        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
          {agent.description}
        </p>
      ) : null}
    </div>
  );
}
