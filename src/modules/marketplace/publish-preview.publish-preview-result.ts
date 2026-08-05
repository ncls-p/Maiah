import type { MarketplaceManifest,SourceResourceType } from "./manifest-types";

export interface PublishPreviewResult {
  name: string;
  description: string | null;
  tags: string[];
  suggestedVersion: string;
  manifestPreview: Record<string, unknown>;
  credentialFields: Array<{
    key: string;
    label: string;
    required?: boolean;
    description?: string | null;
  }>;
  hasExistingDraft: boolean;
  existingItemId: string | null;
  resourceType: SourceResourceType | "marketplace_item";
}

export function manifestSummary(
  manifest: MarketplaceManifest,
): Record<string, unknown> {
  switch (manifest.type) {
    case "agent":
      return {
        type: "agent",
        model: manifest.agent.modelName ?? manifest.agent.modelId,
        provider: manifest.agent.providerName ?? manifest.agent.providerId,
        toolBindings: manifest.toolBindings?.length ?? 0,
        skillBindings: manifest.skillBindings?.length ?? 0,
        knowledgeBindings: manifest.knowledgeBindings?.length ?? 0,
        bundledSkills: manifest.bundledResources?.skills.length ?? 0,
        bundledMcp: manifest.bundledResources?.mcpPresets.length ?? 0,
        bundledCustomTools: manifest.bundledResources?.customTools.length ?? 0,
        hasSystemPrompt: Boolean(manifest.agent.systemPrompt),
      };
    case "skill":
      return {
        type: "skill",
        fileCount:
          manifest.skill.fileCount ?? manifest.skill.markdownFiles.length,
        totalBytes: manifest.skill.totalBytes,
        sourcePackage: manifest.skill.sourcePackage,
      };
    case "custom_tool":
      return {
        type: "custom_tool",
        status: manifest.tool.status,
        hasInputSchema: Boolean(manifest.tool.inputSchema),
        hasOutputSchema: Boolean(manifest.tool.outputSchema),
        n8nWorkflow: Boolean(manifest.tool.n8nWorkflowId),
        requiresCredentials: manifest.tool.requiresCredentials,
      };
    case "mcp_preset":
      return {
        type: "mcp_preset",
        scope: manifest.preset.scope,
        transport: manifest.preset.transport,
        toolCount: manifest.preset.tools.length,
        enabled: manifest.preset.enabled,
        requiresCredentials: manifest.preset.requiresCredentials,
      };
  }
}

export function extractCredentialFields(
  manifest: MarketplaceManifest,
): PublishPreviewResult["credentialFields"] {
  if (manifest.type === "custom_tool") {
    return (manifest.tool.credentialSchema ?? []).map((f) => ({
      key: f.key,
      label: f.label,
      required: f.required,
      description: f.description,
    }));
  }
  if (manifest.type === "mcp_preset") {
    return (manifest.preset.credentialSchema ?? []).map((f) => ({
      key: f.key,
      label: f.label,
      required: f.required,
      description: f.description,
    }));
  }
  if (manifest.type === "agent") {
    const fields: PublishPreviewResult["credentialFields"] = [];
    for (const preset of manifest.bundledResources?.mcpPresets ?? []) {
      for (const f of preset.preset.credentialSchema ?? []) {
        fields.push({
          key: `${preset.preset.serverName}:${f.key}`,
          label: `${preset.preset.serverName} — ${f.label}`,
          required: f.required,
          description: f.description,
        });
      }
    }
    for (const tool of manifest.bundledResources?.customTools ?? []) {
      for (const f of tool.tool.credentialSchema ?? []) {
        fields.push({
          key: `${tool.name}:${f.key}`,
          label: `${tool.name} — ${f.label}`,
          required: f.required,
          description: f.description,
        });
      }
    }
    return fields;
  }
  return [];
}
