import { db } from "@/server/infrastructure/db";
import {
  agentKnowledgeBindings,
  agentSkillBindings,
  agentSkills,
  agentToolBindings,
  customTools,
  knowledgeBases,
  mcpServers,
  mcpTools,
} from "@/server/infrastructure/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import {
  buildCustomToolManifest,
  buildMcpPresetManifest,
  buildSkillContentManifest,
  jsonRecord,
} from "./manifest-builders.json-record";
import {
  resolveAgentVersion,
  resolveToolBindingRef,
} from "./manifest-builders.resolve-agent-version";
import type {
  AgentMarketplaceManifest,
  McpPresetMarketplaceManifest,
  PortableKnowledgeBinding,
  PortableSkillBinding,
  PortableToolBinding,
  ToolMarketplaceManifest,
} from "./manifest-types";

export async function buildAgentManifest(
  agentId: string,
  workspaceId: string,
  name: string,
  description?: string | null,
): Promise<AgentMarketplaceManifest> {
  const resolved = await resolveAgentVersion(agentId);
  if (!resolved) throw new Error("Agent not found");
  const { agent, agentVersion, providerName, modelName } = resolved;
  if (agent.workspaceId !== workspaceId) throw new Error("Agent not found");
  if (agent.kind === "orchestrator") {
    throw new Error("Orchestrators cannot be published to the marketplace yet");
  }
  if (!agentVersion) throw new Error("Agent has no version");

  const toolBindings = await db
    .select()
    .from(agentToolBindings)
    .where(eq(agentToolBindings.agentVersionId, agentVersion.id));

  const skillBindingsRows = await db
    .select()
    .from(agentSkillBindings)
    .where(eq(agentSkillBindings.agentVersionId, agentVersion.id));

  const knowledgeBindingsRows = await db
    .select()
    .from(agentKnowledgeBindings)
    .where(eq(agentKnowledgeBindings.agentVersionId, agentVersion.id));

  const portableToolBindings: PortableToolBinding[] = [];
  for (const binding of toolBindings) {
    const portable = await resolveToolBindingRef(binding, workspaceId);
    if (portable) portableToolBindings.push(portable);
  }

  const skillIds = skillBindingsRows.map((b) => b.skillId);
  const skills =
    skillIds.length > 0
      ? await db
          .select()
          .from(agentSkills)
          .where(
            and(
              inArray(agentSkills.id, skillIds),
              eq(agentSkills.workspaceId, workspaceId),
            ),
          )
      : [];

  const skillBindings: PortableSkillBinding[] = skills.map((skill) => ({
    ref: skill.name,
    bundled: buildSkillContentManifest(skill),
  }));

  const kbIds = knowledgeBindingsRows.map((b) => b.knowledgeBaseId);
  const kbs =
    kbIds.length > 0
      ? await db
          .select()
          .from(knowledgeBases)
          .where(
            and(
              inArray(knowledgeBases.id, kbIds),
              eq(knowledgeBases.workspaceId, workspaceId),
            ),
          )
      : [];

  const knowledgeBindings: PortableKnowledgeBinding[] = kbs.map((kb) => ({
    name: kb.name,
    description: kb.description,
  }));

  const bundledMcpPresets: McpPresetMarketplaceManifest[] = [];
  const bundledCustomTools: ToolMarketplaceManifest[] = [];
  const seenMcpServers = new Set<string>();
  const seenCustomTools = new Set<string>();

  for (const binding of toolBindings) {
    if (binding.toolSource === "mcp") {
      const [tool] = await db
        .select()
        .from(mcpTools)
        .where(eq(mcpTools.id, binding.toolId))
        .limit(1);
      if (!tool || seenMcpServers.has(tool.mcpServerId)) continue;
      const [server] = await db
        .select()
        .from(mcpServers)
        .where(
          and(
            eq(mcpServers.id, tool.mcpServerId),
            eq(mcpServers.workspaceId, workspaceId),
          ),
        )
        .limit(1);
      if (!server) continue;
      seenMcpServers.add(server.id);
      const serverTools = await db
        .select()
        .from(mcpTools)
        .where(eq(mcpTools.mcpServerId, server.id));
      bundledMcpPresets.push(
        buildMcpPresetManifest(
          server.name,
          null,
          server,
          serverTools,
          "server",
        ),
      );
    }
    if (binding.toolSource === "custom") {
      if (seenCustomTools.has(binding.toolId)) continue;
      const [tool] = await db
        .select()
        .from(customTools)
        .where(
          and(
            eq(customTools.id, binding.toolId),
            eq(customTools.workspaceId, workspaceId),
          ),
        )
        .limit(1);
      if (!tool) continue;
      seenCustomTools.add(tool.id);
      bundledCustomTools.push(
        await buildCustomToolManifest(tool, tool.name, tool.description),
      );
    }
  }

  return {
    type: "agent",
    name,
    description: description ?? agent.description ?? undefined,
    agent: {
      systemPrompt: agentVersion.systemPrompt,
      providerId: agentVersion.providerId,
      modelId: agentVersion.modelId,
      providerName,
      modelName,
      temperature: agentVersion.temperature,
      topP: agentVersion.topP,
      maxOutputTokens: agentVersion.maxOutputTokens,
      maxToolCalls: agentVersion.maxToolCalls,
      toolChoice: agentVersion.toolChoice,
      generationSettings: jsonRecord(agentVersion.generationSettingsJson),
      responseFormat: jsonRecord(agentVersion.responseFormatJson),
      memoryPolicy: jsonRecord(agentVersion.memoryPolicyJson),
      guardrails: jsonRecord(agentVersion.guardrailsJson),
      approvalPolicy: jsonRecord(agentVersion.approvalPolicyJson),
    },
    toolBindings: portableToolBindings,
    skillBindings,
    knowledgeBindings,
    bundledResources: {
      skills: skills.map((skill) => ({
        name: skill.name,
        skill: buildSkillContentManifest(skill),
      })),
      mcpPresets: bundledMcpPresets,
      customTools: bundledCustomTools,
    },
  };
}
