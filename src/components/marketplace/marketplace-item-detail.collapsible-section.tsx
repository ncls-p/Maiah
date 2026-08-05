"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  ChevronDown,
  FileText,
  KeyRound,
  Plug,
  Shield,
  Wrench,
} from "lucide-react";
import type {
  MarketplaceManifest,
  PortableToolBinding,
} from "@/modules/marketplace/manifest-types";
import { BUILTIN_TOOL_SUMMARIES } from "@/modules/tool/builtin-tools-catalog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { getToolSourceLabel } from "./marketplace-i18n-helpers";
import { AgentManifestSection, MarketplaceItemDetailData, SkillManifestSection } from "./marketplace-item-detail.marketplace-item-detail-data";
import { CustomToolManifestSection, McpManifestSection } from "./marketplace-item-detail.skill-manifest-details";


export function CollapsibleSection({
  title,
  icon: Icon,
  children,
  defaultOpen = false,
}: {
  title: string;
  icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center justify-between rounded-lg border border-border/60 px-3 py-2 text-left text-sm font-medium hover:bg-muted/50"
        >
          <span className="flex items-center gap-2">
            {Icon ? <Icon className="size-4 text-muted-foreground" /> : null}
            {title}
          </span>
          <ChevronDown
            className={cn(
              "size-4 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
          />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-3">{children}</CollapsibleContent>
    </Collapsible>
  );
}

export function MarketplaceItemDetailSections({
  item,
  onUnshareAction,
}: {
  item: MarketplaceItemDetailData;
  onUnshareAction?: (userId: string) => void;
}) {
  const t = useTranslations("marketplace.detail");
  const manifest = item.latestVersion?.manifestJson;

  return (
    <div className="space-y-6">
      {item.latestVersion ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {t("version", { version: item.latestVersion.version })}
            </CardTitle>
            {item.latestVersion.changelog ? (
              <CardDescription>{item.latestVersion.changelog}</CardDescription>
            ) : null}
          </CardHeader>
          <CardContent>
            {manifest ? (
              <>
                <AgentManifestSection manifest={manifest} />
                <SkillManifestSection manifest={manifest} />
                <CustomToolManifestSection manifest={manifest} />
                <McpManifestSection manifest={manifest} />
              </>
            ) : (
              <p className="text-sm text-muted-foreground">{t("noManifest")}</p>
            )}
          </CardContent>
        </Card>
      ) : null}

      {item.publisher ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("publisher")}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <p className="font-medium">{item.publisher.name}</p>
            <p className="text-muted-foreground">{item.publisher.email}</p>
          </CardContent>
        </Card>
      ) : null}

      {item.isOwner && item.shares.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("sharedWith")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {item.shares.map((share) => (
                <li
                  key={share.userId}
                  className="flex items-center justify-between gap-2 text-sm"
                >
                  <div>
                    <p className="font-medium">{share.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {share.email}
                    </p>
                  </div>
                  {onUnshareAction ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onUnshareAction(share.userId)}
                    >
                      {t("removeShare")}
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
