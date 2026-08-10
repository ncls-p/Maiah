import { relations } from "drizzle-orm";
import {
  agentSkillBindings,
  agentSkills,
  agentVersions,
  agents,
  conversationFolders,
  conversationShares,
  conversations,
  mcpServers,
  messageParts,
  messages,
  toolConnectionRequirements,
  toolConnections,
  toolConnectors,
  userToolSettings,
  users,
  workspaces,
} from "./schema-relations.user-relations";

export const conversationRelations = relations(
  conversations,
  ({ one, many }) => ({
    workspace: one(workspaces, {
      fields: [conversations.workspaceId],
      references: [workspaces.id],
    }),
    agent: one(agents, {
      fields: [conversations.agentId],
      references: [agents.id],
    }),
    agentVersion: one(agentVersions, {
      fields: [conversations.agentVersionId],
      references: [agentVersions.id],
    }),
    user: one(users, {
      fields: [conversations.userId],
      references: [users.id],
    }),
    folder: one(conversationFolders, {
      fields: [conversations.folderId],
      references: [conversationFolders.id],
    }),
    messages: many(messages),
    shares: many(conversationShares),
  }),
);

export const conversationShareRelations = relations(
  conversationShares,
  ({ one }) => ({
    conversation: one(conversations, {
      fields: [conversationShares.conversationId],
      references: [conversations.id],
    }),
    sharedBy: one(users, {
      fields: [conversationShares.sharedByUserId],
      references: [users.id],
      relationName: "conversationSharedBy",
    }),
    sharedWith: one(users, {
      fields: [conversationShares.sharedWithUserId],
      references: [users.id],
      relationName: "conversationSharedWith",
    }),
  }),
);

export const messageRelations = relations(messages, ({ one, many }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
  parts: many(messageParts),
}));

export const agentSkillRelations = relations(agentSkills, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [agentSkills.workspaceId],
    references: [workspaces.id],
  }),
  creator: one(users, {
    fields: [agentSkills.createdById],
    references: [users.id],
  }),
  bindings: many(agentSkillBindings),
}));

export const agentSkillBindingRelations = relations(
  agentSkillBindings,
  ({ one }) => ({
    agentVersion: one(agentVersions, {
      fields: [agentSkillBindings.agentVersionId],
      references: [agentVersions.id],
    }),
    skill: one(agentSkills, {
      fields: [agentSkillBindings.skillId],
      references: [agentSkills.id],
    }),
  }),
);

export const toolConnectorRelations = relations(
  toolConnectors,
  ({ one, many }) => ({
    workspace: one(workspaces, {
      fields: [toolConnectors.workspaceId],
      references: [workspaces.id],
    }),
    creator: one(users, {
      fields: [toolConnectors.createdById],
      references: [users.id],
    }),
    mcpServer: one(mcpServers, {
      fields: [toolConnectors.mcpServerId],
      references: [mcpServers.id],
    }),
    connections: many(toolConnections),
    requirements: many(toolConnectionRequirements),
  }),
);

export const toolConnectionRelations = relations(
  toolConnections,
  ({ one, many }) => ({
    workspace: one(workspaces, {
      fields: [toolConnections.workspaceId],
      references: [workspaces.id],
    }),
    connector: one(toolConnectors, {
      fields: [toolConnections.connectorId],
      references: [toolConnectors.id],
    }),
    ownerUser: one(users, {
      fields: [toolConnections.ownerUserId],
      references: [users.id],
    }),
    userSettings: many(userToolSettings),
  }),
);

export const toolConnectionRequirementRelations = relations(
  toolConnectionRequirements,
  ({ one }) => ({
    workspace: one(workspaces, {
      fields: [toolConnectionRequirements.workspaceId],
      references: [workspaces.id],
    }),
    connector: one(toolConnectors, {
      fields: [toolConnectionRequirements.connectorId],
      references: [toolConnectors.id],
    }),
  }),
);

export const userToolSettingRelations = relations(
  userToolSettings,
  ({ one }) => ({
    workspace: one(workspaces, {
      fields: [userToolSettings.workspaceId],
      references: [workspaces.id],
    }),
    user: one(users, {
      fields: [userToolSettings.userId],
      references: [users.id],
    }),
    connection: one(toolConnections, {
      fields: [userToolSettings.connectionId],
      references: [toolConnections.id],
    }),
  }),
);
