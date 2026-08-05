import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/server/infrastructure/db";
import { BUILTIN_TOOL_SUMMARIES } from "@/modules/tool/builtin-tools-catalog";
import {
  agentKnowledgeBindings,
  agents,
  agentSkillBindings,
  agentSkills,
  agentToolBindings,
  agentVersions,
  aiModels,
  aiProviders,
  customToolSecretRequests,
  customTools,
  knowledgeBases,
  mcpServers,
  mcpTools,
} from "@/server/infrastructure/db/schema";
import type {
  AgentMarketplaceManifest,
  CredentialFieldSchema,
  McpPresetMarketplaceManifest,
  PortableKnowledgeBinding,
  PortableSkillBinding,
  PortableToolBinding,
  SkillContentManifest,
  SkillMarketplaceManifest,
  ToolMarketplaceManifest,
} from "./manifest-types";
import { skillFileStats } from "./manifest-types";

export function jsonRecord(
  value: unknown,
): Record<string, unknown> | null | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function parseCredentialFields(fieldsJson: unknown): CredentialFieldSchema[] {
  if (!Array.isArray(fieldsJson)) return [];
  return fieldsJson
    .filter((f) => f && typeof f === "object")
    .map((f) => {
      const field = f as Record<string, unknown>;
      return {
        key: String(field.key ?? field.name ?? ""),
        label: String(field.label ?? field.key ?? field.name ?? ""),
        type: field.type ? String(field.type) : undefined,
        required: Boolean(field.required),
        description:
          typeof field.description === "string" ? field.description : null,
      };
    })
    .filter((f) => f.key.length > 0);
}

function mcpCredentialSchema(
  server: typeof mcpServers.$inferSelect,
): CredentialFieldSchema[] {
  const fields: CredentialFieldSchema[] = [];
  const headers = server.encryptedHeadersJson;
  const env = server.encryptedEnvJson;
  if (headers && typeof headers === "object" && !Array.isArray(headers)) {
    for (const key of Object.keys(headers as Record<string, unknown>)) {
      fields.push({
        key: `header:${key}`,
        label: `Header: ${key}`,
        required: true,
      });
    }
  }
  if (env && typeof env === "object" && !Array.isArray(env)) {
    for (const key of Object.keys(env as Record<string, unknown>)) {
      fields.push({ key: `env:${key}`, label: `Env: ${key}`, required: true });
    }
  }
  return fields;
}

export function buildSkillContentManifest(
  skill: typeof agentSkills.$inferSelect,
): SkillContentManifest {
  const markdownFiles = Array.isArray(skill.markdownFilesJson)
    ? (skill.markdownFilesJson as Array<{ path: string; content: string }>)
    : [];
  const stats = skillFileStats(markdownFiles);
  return {
    markdownFiles,
    sourcePackage: skill.sourcePackage ?? undefined,
    sourceSkillName: skill.sourceSkillName ?? undefined,
    installCommand: skill.installCommand ?? undefined,
    metadata: jsonRecord(skill.metadataJson) ?? undefined,
    fileCount: stats.fileCount,
    totalBytes: stats.totalBytes,
  };
}

export function buildSkillManifest(
  skill: typeof agentSkills.$inferSelect,
  name: string,
  description?: string | null,
): SkillMarketplaceManifest {
  return {
    type: "skill",
    name,
    description: description ?? skill.description ?? undefined,
    skill: buildSkillContentManifest(skill),
  };
}

export async function buildCustomToolManifest(
  tool: typeof customTools.$inferSelect,
  name: string,
  description?: string | null,
): Promise<ToolMarketplaceManifest> {
  const secretRequests = await db
    .select()
    .from(customToolSecretRequests)
    .where(eq(customToolSecretRequests.customToolId, tool.id));

  const credentialSchema = secretRequests.flatMap((req) =>
    parseCredentialFields(req.fieldsJson),
  );

  return {
    type: "custom_tool",
    name,
    description: description ?? tool.description ?? undefined,
    tool: {
      status: tool.status,
      inputSchema: jsonRecord(tool.inputSchemaJson) ?? undefined,
      outputSchema: jsonRecord(tool.outputSchemaJson) ?? undefined,
      n8nWorkflowId: tool.n8nWorkflowId ?? undefined,
      n8nWorkflowUrl: tool.n8nWorkflowUrl ?? undefined,
      metadata: jsonRecord(tool.metadataJson) ?? undefined,
      credentialSchema:
        credentialSchema.length > 0 ? credentialSchema : undefined,
      requiresCredentials: credentialSchema.length > 0,
    },
  };
}

export function buildMcpPresetManifest(
  name: string,
  description: string | null | undefined,
  server: typeof mcpServers.$inferSelect,
  tools: Array<typeof mcpTools.$inferSelect>,
  scope: "server" | "tool",
): McpPresetMarketplaceManifest {
  const args = Array.isArray(server.argsJson)
    ? (server.argsJson as string[])
    : undefined;
  const credentialSchema = mcpCredentialSchema(server);
  const hasCredentials = credentialSchema.length > 0;

  return {
    type: "mcp_preset",
    name,
    description: description ?? undefined,
    preset: {
      scope,
      serverName: server.name,
      transport: server.transport,
      command: server.command ?? undefined,
      args,
      url: server.url ?? undefined,
      enabled: server.enabled,
      requireApproval: server.requireApproval,
      healthStatus: server.healthStatus ?? undefined,
      requiresCredentials: hasCredentials,
      credentialSchema: hasCredentials ? credentialSchema : undefined,
      tools: tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: jsonRecord(tool.inputSchemaJson),
        outputSchema: jsonRecord(tool.outputSchemaJson),
        requireApproval: tool.requireApproval,
        enabled: tool.enabled,
      })),
    },
  };
}
