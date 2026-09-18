import { eq, and, isNull } from "drizzle-orm";
import { db } from "@/server/infrastructure/db";
import { appSettings, agents } from "@/server/infrastructure/db/schema";
import { authorization } from "@/server/domain/services/authorization";
import { organizationIdForWorkspace } from "@/modules/organization/workspace-organization";
import {
  getWorkflowBuilderAdminState,
  getOrganizationWorkflowBuilderAgent,
} from "@/modules/workflows/builder-settings";
import type { CompanionState } from "./contracts";
export class CompanionAccessError extends Error {}
export class CompanionConfigurationError extends Error {}
export const GLOBAL_KEY = "companion:enabled";
const orgKey = (organizationId: string) =>
  `companion:organization:${organizationId}`;
const userKey = (userId: string) => `companion:user:${userId}`;
export async function readSetting(key: string) {
  const [row] = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, key))
    .limit(1);
  return row?.valueJson;
}
export async function writeSetting(
  key: string,
  valueJson: unknown,
  updatedById: string,
) {
  await db
    .insert(appSettings)
    .values({ key, valueJson, updatedById, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { valueJson, updatedById, updatedAt: new Date() },
    });
}
export async function companionAdminState(organizationId: string) {
  const [enabled, config, builders, assistants] = await Promise.all([
    readSetting(GLOBAL_KEY),
    readSetting(orgKey(organizationId)),
    getWorkflowBuilderAdminState(organizationId),
    db
      .select({ id: agents.id })
      .from(agents)
      .where(and(eq(agents.kind, "assistant"), isNull(agents.archivedAt))),
  ]);
  const ids = new Set(assistants.map((row) => row.id));
  return {
    enabled: enabled === true,
    agentId: typeof config === "string" ? config : null,
    availableAgents: builders.availableAgents.filter((agent) =>
      ids.has(agent.id),
    ),
  };
}
export async function setCompanionAgent(
  organizationId: string,
  agentId: string | null,
  userId: string,
) {
  const state = await companionAdminState(organizationId);
  if (agentId && !state.availableAgents.some((agent) => agent.id === agentId))
    throw new CompanionConfigurationError(
      "Select an assistant available to this organization",
    );
  await writeSetting(orgKey(organizationId), agentId, userId);
}
export async function setUserCompanionEnabled(
  userId: string,
  enabled: boolean,
) {
  await writeSetting(userKey(userId), enabled, userId);
}
export async function getUserCompanionEnabled(userId: string) {
  return (await readSetting(userKey(userId))) !== false;
}
export async function getCompanionState(
  userId: string,
  workspaceId: string,
): Promise<CompanionState | null> {
  if (!(await authorization.requireWorkspaceMember(userId, workspaceId)))
    return null;
  const organizationId = await organizationIdForWorkspace(workspaceId);
  if (!organizationId) return null;
  const enabled = (await readSetting(GLOBAL_KEY)) === true;
  const configured = await readSetting(orgKey(organizationId));
  const userEnabled = await getUserCompanionEnabled(userId);
  const agentId = typeof configured === "string" ? configured : null;
  const agent = agentId
    ? await getOrganizationWorkflowBuilderAgent(agentId, workspaceId)
    : null;
  const allowed = await authorization.hasPermission(
    { principalType: "user", principalId: userId },
    "agents.chat",
    "workspace",
    workspaceId,
  );
  return {
    enabled,
    userEnabled,
    organizationId,
    agentId: agent?.kind === "assistant" ? agent.id : null,
    name: agent?.name ?? null,
    available:
      enabled &&
      userEnabled &&
      !!agent?.activeVersionId &&
      agent.kind === "assistant" &&
      allowed,
  };
}
export async function requireCompanion(
  userId: string,
  workspaceId: string,
  agentId?: string,
) {
  const state = await getCompanionState(userId, workspaceId);
  if (
    !state?.available ||
    !state.agentId ||
    (agentId && state.agentId !== agentId)
  )
    throw new CompanionAccessError("Companion unavailable or access revoked");
  return state;
}
