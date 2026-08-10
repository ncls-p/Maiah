"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { MarketplaceManifest } from "@/modules/marketplace/manifest-types";
import { KeyRound, Plug } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { CollapsibleSection } from "./marketplace-item-detail.collapsible-section";
import {
  JsonBlock,
  SkillMarketplaceManifest,
} from "./marketplace-item-detail.marketplace-item-detail-data";

export function SkillManifestDetails({
  manifest,
  t,
}: {
  manifest: SkillMarketplaceManifest;
  t: ReturnType<typeof useTranslations>;
}) {
  const [selectedFile, setSelectedFile] = useState(
    manifest.skill.markdownFiles[0]?.path ?? "",
  );
  const file = manifest.skill.markdownFiles.find(
    (f) => f.path === selectedFile,
  );
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
        <span>
          {t("fileCount", {
            count:
              manifest.skill.fileCount ?? manifest.skill.markdownFiles.length,
          })}
        </span>
        {manifest.skill.totalBytes ? (
          <span>
            ·{" "}
            {t("totalSize", {
              size: Math.round(manifest.skill.totalBytes / 1024),
            })}
          </span>
        ) : null}
        {manifest.skill.sourcePackage ? (
          <span>· {manifest.skill.sourcePackage}</span>
        ) : null}
      </div>
      {manifest.skill.installCommand ? (
        <InfoRow
          label={t("installCommand")}
          value={manifest.skill.installCommand}
        />
      ) : null}
      <div className="flex flex-wrap gap-2">
        {manifest.skill.markdownFiles.map((f) => (
          <Button
            key={f.path}
            size="sm"
            variant={selectedFile === f.path ? "default" : "outline"}
            onClick={() => setSelectedFile(f.path)}
          >
            {f.path}
          </Button>
        ))}
      </div>
      {file ? (
        <pre className="max-h-64 overflow-auto rounded-lg border bg-muted/40 p-3 text-xs whitespace-pre-wrap">
          {file.content}
        </pre>
      ) : null}
    </div>
  );
}

export function CustomToolManifestSection({
  manifest,
}: {
  manifest: MarketplaceManifest;
}) {
  const t = useTranslations("marketplace.manifest");
  const tCommon = useTranslations("common");

  if (manifest.type !== "custom_tool") return null;

  const hasTechnicalDetails = Boolean(
    manifest.tool.inputSchema || manifest.tool.outputSchema,
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {manifest.tool.status ? (
          <Badge variant="secondary">
            {t("status")}: {manifest.tool.status}
          </Badge>
        ) : null}
        {manifest.tool.requiresCredentials ? (
          <Badge variant="outline" className="gap-1">
            <KeyRound className="size-3" />
            {t("credentialsRequired")}
          </Badge>
        ) : null}
      </div>
      {manifest.tool.n8nWorkflowUrl ? (
        <InfoRow label={t("workflow")} value={manifest.tool.n8nWorkflowUrl} />
      ) : null}
      {manifest.tool.credentialSchema?.length ? (
        <ul className="space-y-1 text-sm">
          {manifest.tool.credentialSchema.map((f) => (
            <li key={f.key}>
              {f.label}
              {f.required ? " *" : ""}
            </li>
          ))}
        </ul>
      ) : null}
      {hasTechnicalDetails ? (
        <CollapsibleSection title={tCommon("showAdvanced")}>
          <div className="space-y-4">
            {manifest.tool.inputSchema ? (
              <div>
                <p className="mb-2 text-xs font-medium text-muted-foreground">
                  {t("inputSchema")}
                </p>
                <JsonBlock value={manifest.tool.inputSchema} />
              </div>
            ) : null}
            {manifest.tool.outputSchema ? (
              <div>
                <p className="mb-2 text-xs font-medium text-muted-foreground">
                  {t("outputSchema")}
                </p>
                <JsonBlock value={manifest.tool.outputSchema} />
              </div>
            ) : null}
          </div>
        </CollapsibleSection>
      ) : null}
    </div>
  );
}

export function McpManifestSection({
  manifest,
}: {
  manifest: MarketplaceManifest;
}) {
  const t = useTranslations("marketplace.manifest");

  if (manifest.type !== "mcp_preset") return null;
  const { preset } = manifest;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Badge variant="secondary">{preset.transport}</Badge>
        <Badge variant="outline">
          {t("scope")}:{" "}
          {preset.scope === "server" ? t("scopeServer") : t("scopeTool")}
        </Badge>
        {preset.enabled ? (
          <Badge variant="outline" className="text-success">
            {t("enabled")}
          </Badge>
        ) : (
          <Badge variant="outline">{t("disabled")}</Badge>
        )}
        {preset.requiresCredentials ? (
          <Badge variant="outline" className="gap-1">
            <KeyRound className="size-3" />
            {t("credentialsRequired")}
          </Badge>
        ) : null}
      </div>
      <InfoRow
        label={t("endpoint")}
        value={preset.url ?? preset.command ?? "—"}
      />
      {preset.args?.length ? (
        <InfoRow label={t("args")} value={preset.args.join(" ")} />
      ) : null}
      <CollapsibleSection
        title={t("toolsCount", { count: preset.tools.length })}
        icon={Plug}
        defaultOpen
      >
        <ul className="space-y-2">
          {preset.tools.map((tool) => (
            <li
              key={tool.name}
              className="rounded-lg border border-border/60 p-3 text-sm"
            >
              <div className="flex items-center gap-2">
                <span className="font-medium">{tool.name}</span>
                {tool.enabled ? null : (
                  <Badge variant="outline" className="text-[10px]">
                    {t("disabled")}
                  </Badge>
                )}
              </div>
              {tool.description ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {tool.description}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      </CollapsibleSection>
    </div>
  );
}

export function InfoRow({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="text-sm break-all">{value}</p>
    </div>
  );
}
