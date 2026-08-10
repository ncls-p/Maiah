import { relations } from "drizzle-orm";
import * as schema from "./schema-tables";

export const { accounts, agentKnowledgeBindings, agentSkillBindings, agentSkills, agentToolBindings, agentVersions, agents, aiProviders, conversationFolders, conversationShares, conversations, knowledgeBases, mcpServers, messageParts, messages, organizations, organizationMembers, sessions, teamMembers, teams, toolConnectionRequirements, toolConnections, toolConnectors, userAgentPreferences, userToolSettings, users, workspaceMembers, workspaces } = schema;

// ─── Relations ─────────────────────────────────────────────────────────

export const userRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  accounts: many(accounts),
  workspaceMembers: many(workspaceMembers),
  organizationMembers: many(organizationMembers),
  teamMembers: many(teamMembers),
  agentPreferences: many(userAgentPreferences),
  conversationShares: many(conversationShares),
}));

export const organizationRelations = relations(organizations, ({ many }) => ({
  members: many(organizationMembers),
  teams: many(teams),
  workspaces: many(workspaces),
}));

export const organizationMemberRelations = relations(organizationMembers, ({ one }) => ({
  organization: one(organizations, {
    fields: [organizationMembers.organizationId],
    references: [organizations.id],
  }),
  user: one(users, {
    fields: [organizationMembers.userId],
    references: [users.id],
  }),
}));

export const teamRelations = relations(teams, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [teams.organizationId],
    references: [organizations.id],
  }),
  creator: one(users, {
    fields: [teams.createdById],
    references: [users.id],
  }),
  members: many(teamMembers),
}));

export const teamMemberRelations = relations(teamMembers, ({ one }) => ({
  team: one(teams, {
    fields: [teamMembers.teamId],
    references: [teams.id],
  }),
  user: one(users, {
    fields: [teamMembers.userId],
    references: [users.id],
  }),
}));

export const sessionRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const workspaceRelations = relations(workspaces, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [workspaces.organizationId],
    references: [organizations.id],
  }),
  creator: one(users, {
    fields: [workspaces.createdById],
    references: [users.id],
  }),
  members: many(workspaceMembers),
  agents: many(agents),
  agentPreferences: many(userAgentPreferences),
  conversationFolders: many(conversationFolders),
  providers: many(aiProviders),
  mcpServers: many(mcpServers),
  toolConnectors: many(toolConnectors),
  toolConnections: many(toolConnections),
  knowledgeBases: many(knowledgeBases),
  skills: many(agentSkills),
}));

export const agentRelations = relations(agents, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [agents.workspaceId],
    references: [workspaces.id],
  }),
  creator: one(users, {
    fields: [agents.createdById],
    references: [users.id],
  }),
  activeVersion: one(agentVersions, {
    fields: [agents.activeVersionId],
    references: [agentVersions.id],
  }),
  versions: many(agentVersions),
  userPreferences: many(userAgentPreferences),
}));

export const userAgentPreferenceRelations = relations(userAgentPreferences, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [userAgentPreferences.workspaceId],
    references: [workspaces.id],
  }),
  user: one(users, {
    fields: [userAgentPreferences.userId],
    references: [users.id],
  }),
  defaultAgent: one(agents, {
    fields: [userAgentPreferences.defaultAgentId],
    references: [agents.id],
  }),
}));

export const agentVersionRelations = relations(agentVersions, ({ one, many }) => ({
  agent: one(agents, {
    fields: [agentVersions.agentId],
    references: [agents.id],
  }),
  creator: one(users, {
    fields: [agentVersions.createdById],
    references: [users.id],
  }),
  toolBindings: many(agentToolBindings),
  knowledgeBindings: many(agentKnowledgeBindings),
  skillBindings: many(agentSkillBindings),
}));

export const conversationFolderRelations = relations(conversationFolders, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [conversationFolders.workspaceId],
    references: [workspaces.id],
  }),
  user: one(users, {
    fields: [conversationFolders.userId],
    references: [users.id],
  }),
  conversations: many(conversations),
}));
