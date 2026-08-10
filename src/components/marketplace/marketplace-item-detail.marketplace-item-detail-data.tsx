"use client";

import { Badge } from "@/components/ui/badge";
import type {
  MarketplaceManifest,
  PortableToolBinding,
} from "@/modules/marketplace/manifest-types";
import { BUILTIN_TOOL_SUMMARIES } from "@/modules/tool/builtin-tools-catalog";
import { FileText, Shield, Wrench } from "lucide-react";
import { useTranslations } from "next-intl";
import { getToolSourceLabel } from "./marketplace-i18n-helpers";
import { CollapsibleSection } from "./marketplace-item-detail.collapsible-section";
import {
  InfoRow,
  SkillManifestDetails,
} from "./marketplace-item-detail.skill-manifest-details";

export interface MarketplaceItemDetailData {
  id: string;
  name: string;
  description: string | null;
  type: string;
  status: string;
  visibility: string;
  tagsJson: string[] | null;
  publisherUserId: string;
  shareCount?: number;
  publishedAt: string | null;
  createdAt: string;
  totalDownloads: number;
  isFeatured: boolean;
  latestVersion: {
    version: string;
    changelog: string | null;
    manifestJson: MarketplaceManifest;
    createdAt: string;
  } | null;
  publisher: { id: string; name: string; email: string } | null;
  shares: Array<{
    userId: string;
    name: string;
    email: string;
    sharedAt: string;
  }>;
  isOwner: boolean;
  canInstall?: boolean;
}

const BUILTIN_BY_ID = new Map(
  BUILTIN_TOOL_SUMMARIES.map((tool) => [tool.id, tool]),
);

function formatToolBindingLabel(binding: PortableToolBinding) {
  if (binding.label) return binding.label;
  if (binding.source === "builtin") {
    const tool = BUILTIN_BY_ID.get(binding.ref);
    return tool?.displayName ?? tool?.name ?? binding.ref;
  }
  return binding.ref;
}

export function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="max-h-48 overflow-auto rounded-lg bg-muted p-3 text-xs">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

export function AgentManifestSection({
  manifest,
}: {
  manifest: MarketplaceManifest;
}) {
  const t = useTranslations("marketplace.manifest");
  const tCommon = useTranslations("common");
  const tToolSources = useTranslations("marketplace");

  if (manifest.type !== "agent") return null;

  const hasTechnicalDetails = Boolean(manifest.agent.guardrails);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <InfoRow
          label={t("provider")}
          value={
            manifest.agent.providerName ?? manifest.agent.providerId ?? "—"
          }
        />
        <InfoRow
          label={t("model")}
          value={manifest.agent.modelName ?? manifest.agent.modelId ?? "—"}
        />
        <InfoRow
          label={t("maxTokens")}
          value={manifest.agent.maxOutputTokens ?? "—"}
        />
        <InfoRow
          label={t("maxToolCalls")}
          value={manifest.agent.maxToolCalls ?? "—"}
        />
        <InfoRow
          label={t("temperature")}
          value={manifest.agent.temperature ?? "—"}
        />
        <InfoRow
          label={t("toolChoice")}
          value={manifest.agent.toolChoice ?? "—"}
        />
      </div>
      {manifest.agent.systemPrompt ? (
        <CollapsibleSection title={t("instructions")} icon={FileText}>
          <p className="whitespace-pre-wrap text-sm leading-relaxed">
            {manifest.agent.systemPrompt}
          </p>
        </CollapsibleSection>
      ) : null}
      {(manifest.toolBindings?.length ?? 0) > 0 ? (
        <CollapsibleSection title={t("linkedTools")} icon={Wrench} defaultOpen>
          <ul className="space-y-2 text-sm">
            {manifest.toolBindings!.map((b) => (
              <li
                key={`${b.source}:${b.ref}`}
                className="flex flex-wrap items-center gap-2"
              >
                <Badge variant="outline" className="text-[10px]">
                  {getToolSourceLabel(b.source, (key) =>
                    tToolSources(key as "toolSources.builtin"),
                  )}
                </Badge>
                <span className="font-medium">{formatToolBindingLabel(b)}</span>
                {b.requireApproval ? (
                  <Badge variant="secondary" className="text-[10px]">
                    {t("approval")}
                  </Badge>
                ) : null}
              </li>
            ))}
          </ul>
        </CollapsibleSection>
      ) : null}
      {(manifest.skillBindings?.length ?? 0) > 0 ? (
        <CollapsibleSection title={t("skills")} icon={FileText} defaultOpen>
          <ul className="space-y-1 text-sm">
            {manifest.skillBindings!.map((s) => (
              <li key={s.ref}>
                {s.ref}
                {s.bundled ? (
                  <span className="text-muted-foreground">
                    {" "}
                    (
                    {t("fileCount", {
                      count:
                        s.bundled.fileCount ?? s.bundled.markdownFiles.length,
                    })}
                    )
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </CollapsibleSection>
      ) : null}
      {(manifest.knowledgeBindings?.length ?? 0) > 0 ? (
        <CollapsibleSection title={t("knowledgeRefs")} icon={FileText}>
          <ul className="space-y-1 text-sm">
            {manifest.knowledgeBindings!.map((kb) => (
              <li key={kb.name}>
                <span className="font-medium">{kb.name}</span>
                {kb.description ? (
                  <p className="text-xs text-muted-foreground">
                    {kb.description}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </CollapsibleSection>
      ) : null}
      {hasTechnicalDetails ? (
        <CollapsibleSection title={tCommon("showAdvanced")} icon={Shield}>
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">
              {t("guardrails")}
            </p>
            <JsonBlock value={manifest.agent.guardrails} />
          </div>
        </CollapsibleSection>
      ) : null}
    </div>
  );
}

export type SkillMarketplaceManifest = Extract<
  MarketplaceManifest,
  { type: "skill" }
>;

export function SkillManifestSection({
  manifest,
}: {
  manifest: MarketplaceManifest;
}) {
  const t = useTranslations("marketplace.manifest");

  if (manifest.type !== "skill") return null;

  return <SkillManifestDetails manifest={manifest} t={t} />;
}
