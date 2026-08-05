"use client";

import { Building2Icon,FolderKanbanIcon,UserIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";

export type ResourceProvenance = {
  scope: "user" | "workspace" | "organization";
  scopeName: string;
  ownerName: string;
};

export function ResourceProvenanceBadge({
  provenance,
  className,
}: {
  provenance: ResourceProvenance;
  className?: string;
}) {
  const t = useTranslations("resourceProvenance");
  const Icon =
    provenance.scope === "user"
      ? UserIcon
      : provenance.scope === "organization"
        ? Building2Icon
        : FolderKanbanIcon;
  const scopeLabel = t(provenance.scope);

  return (
    <Badge
      variant="outline"
      className={`max-w-full gap-1.5 bg-background/70 font-normal text-muted-foreground ${className ?? ""}`}
      title={t("title", {
        scope: scopeLabel,
        name: provenance.scopeName,
        owner: provenance.ownerName,
      })}
    >
      <Icon className="size-3 shrink-0" aria-hidden="true" />
      <span className="truncate">
        {scopeLabel} · {provenance.scopeName}
      </span>
    </Badge>
  );
}
