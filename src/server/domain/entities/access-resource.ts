export const ACCESS_RESOURCE_TYPES = ["agent", "provider", "model", "mcp_server", "tool_connector", "tool_connection", "custom_tool", "knowledge_base", "skill", "workflow", "scheduled_task", "conversation", "marketplace_item"] as const;

export type AccessResourceType = (typeof ACCESS_RESOURCE_TYPES)[number];

export const ROLE_BINDING_RESOURCE_TYPES = ["organization", "workspace", ...ACCESS_RESOURCE_TYPES] as const;

export type RoleBindingResourceType = (typeof ROLE_BINDING_RESOURCE_TYPES)[number];

export type AccessResourceDefinition = {
  type: AccessResourceType;
  label: string;
  pluralLabel: string;
  permissionDomains: readonly string[];
};

export const ACCESS_RESOURCE_DEFINITIONS: readonly AccessResourceDefinition[] = [
  {
    type: "agent",
    label: "Assistant",
    pluralLabel: "Assistants",
    permissionDomains: ["agents", "agentVersions"],
  },
  {
    type: "provider",
    label: "Provider connection",
    pluralLabel: "Provider connections",
    permissionDomains: ["providers"],
  },
  {
    type: "model",
    label: "Model",
    pluralLabel: "Models",
    permissionDomains: ["models"],
  },
  {
    type: "mcp_server",
    label: "MCP server",
    pluralLabel: "MCP servers",
    permissionDomains: ["mcpServers", "tools"],
  },
  {
    type: "tool_connector",
    label: "Connector",
    pluralLabel: "Connectors",
    permissionDomains: ["tools"],
  },
  {
    type: "tool_connection",
    label: "Connection",
    pluralLabel: "Connections",
    permissionDomains: ["tools"],
  },
  {
    type: "custom_tool",
    label: "Custom tool",
    pluralLabel: "Custom tools",
    permissionDomains: ["tools"],
  },
  {
    type: "knowledge_base",
    label: "Knowledge base",
    pluralLabel: "Knowledge bases",
    permissionDomains: ["knowledgeBases"],
  },
  {
    type: "skill",
    label: "Skill",
    pluralLabel: "Skills",
    permissionDomains: ["tools"],
  },
  {
    type: "workflow",
    label: "Workflow",
    pluralLabel: "Workflows",
    permissionDomains: ["workflows"],
  },
  {
    type: "scheduled_task",
    label: "Scheduled task",
    pluralLabel: "Scheduled tasks",
    permissionDomains: ["agents", "conversations"],
  },
  {
    type: "conversation",
    label: "Conversation",
    pluralLabel: "Conversations",
    permissionDomains: ["conversations"],
  },
  {
    type: "marketplace_item",
    label: "Marketplace item",
    pluralLabel: "Marketplace items",
    permissionDomains: ["marketplaceItems"],
  },
];

export function isAccessResourceType(value: string): value is AccessResourceType {
  return (ACCESS_RESOURCE_TYPES as readonly string[]).includes(value);
}

export function resourceDefinition(type: AccessResourceType) {
  return ACCESS_RESOURCE_DEFINITIONS.find((definition) => definition.type === type);
}
