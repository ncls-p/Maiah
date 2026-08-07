import { listKnowledgeBases } from "@/modules/knowledge/use-cases";
import { listAgentSkills } from "@/modules/skills/use-cases";
import { listBuiltInTools, requiresApproval } from "@/modules/tool/builtin-tools";
import { canViewCustomTool, canViewMcpServer } from "@/modules/tool/use-cases.tool-binding-input-schema";
import { db } from "@/server/infrastructure/db";
import { customTools, mcpServers, mcpTools } from "@/server/infrastructure/db/schema";
import { and, eq, isNull, or } from "drizzle-orm";

type Binding = { toolSource: string; toolId: string; requireApproval: boolean };

export async function listAvailableCapabilities(input: { workspaceId: string; userId: string; canManageGlobal: boolean; bindings: Binding[]; boundSkillIds: Set<string>; boundKnowledgeIds: Set<string> }) {
  const { workspaceId, userId, canManageGlobal, bindings, boundSkillIds, boundKnowledgeIds } = input;
  const boundToolKeys = new Set(bindings.map((binding) => `${binding.toolSource}:${binding.toolId}`));
  const approvalByKey = new Map(bindings.map((binding) => [`${binding.toolSource}:${binding.toolId}`, binding.requireApproval]));
  const [customRows, mcpRows, skillRows, knowledgeRows] = await Promise.all([
    db.select().from(customTools).where(and(eq(customTools.workspaceId, workspaceId), isNull(customTools.archivedAt), or(eq(customTools.createdById, userId), eq(customTools.isGlobal, true)))),
    db.select({ id: mcpTools.id, name: mcpTools.name, description: mcpTools.description, requireApproval: mcpTools.requireApproval, serverName: mcpServers.name, serverRequireApproval: mcpServers.requireApproval, serverId: mcpServers.id, createdById: mcpServers.createdById, isGlobal: mcpServers.isGlobal }).from(mcpTools).innerJoin(mcpServers, eq(mcpTools.mcpServerId, mcpServers.id)).where(and(eq(mcpServers.workspaceId, workspaceId), eq(mcpServers.enabled, true), eq(mcpTools.enabled, true), isNull(mcpServers.archivedAt))),
    listAgentSkills(workspaceId, userId, canManageGlobal),
    listKnowledgeBases(workspaceId, userId, canManageGlobal),
  ]);
  const visibleCustom = (await Promise.all(customRows.map(async (tool) => (await canViewCustomTool(tool, userId)) ? tool : null))).filter((tool): tool is NonNullable<typeof tool> => tool !== null && tool.status === "active");
  const visibleMcp = (await Promise.all(mcpRows.map(async (tool) => (await canViewMcpServer({ id: tool.serverId, createdById: tool.createdById, isGlobal: tool.isGlobal }, userId)) ? tool : null))).filter((tool): tool is NonNullable<typeof tool> => tool !== null);
  const builtin = listBuiltInTools().map((tool) => ({ id: tool.id, source: "builtin" as const, name: tool.displayName, description: tool.description, group: tool.category, requireApproval: approvalByKey.get(`builtin:${tool.id}`) ?? requiresApproval(tool.riskLevel), attached: boundToolKeys.has(`builtin:${tool.id}`) }));
  const custom = visibleCustom.map((tool) => ({ id: tool.id, source: "custom" as const, name: tool.name, description: tool.description, group: null, requireApproval: approvalByKey.get(`custom:${tool.id}`) ?? true, attached: boundToolKeys.has(`custom:${tool.id}`) }));
  const mcp = visibleMcp.map((tool) => ({ id: tool.id, source: "mcp" as const, name: tool.name, description: tool.description, group: tool.serverName, requireApproval: approvalByKey.get(`mcp:${tool.id}`) ?? (tool.serverRequireApproval || tool.requireApproval), attached: boundToolKeys.has(`mcp:${tool.id}`) }));
  const skills = skillRows.map((skill) => ({ id: skill.id, name: skill.name, description: skill.description, attached: boundSkillIds.has(skill.id) }));
  const knowledge = knowledgeRows.map((item) => ({ id: item.id, name: item.name, description: item.description, attached: boundKnowledgeIds.has(item.id) }));
  return { tools: [...builtin, ...custom, ...mcp], skills, knowledge };
}
