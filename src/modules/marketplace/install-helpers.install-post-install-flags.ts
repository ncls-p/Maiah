import { and, eq, isNull, or } from "drizzle-orm";
import { db } from "@/server/infrastructure/db";
import {
  agentKnowledgeBindings,
  agents,
  agentSkillBindings,
  agentSkills,
  agentToolBindings,
  agentVersions,
  aiModels,
  aiProviders,
  customTools,
  knowledgeBases,
  mcpServers,
  mcpTools,
} from "@/server/infrastructure/db/schema";
import type {
  AgentMarketplaceManifest,
  MarketplaceManifest,
  McpPresetMarketplaceManifest,
  ToolMarketplaceManifest,
} from "./manifest-types";

export function installPostInstallFlags(manifest: MarketplaceManifest) {
  if (manifest.type === "mcp_preset") {
    return {
      requiresCredentials: manifest.preset.requiresCredentials,
    };
  }
  if (manifest.type === "custom_tool") {
    return {
      requiresCredentials: Boolean(manifest.tool.requiresCredentials),
    };
  }
  return { requiresCredentials: false };
}
