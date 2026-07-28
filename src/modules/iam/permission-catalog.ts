export type PermissionCatalogGroup = {
  id: string;
  label: string;
  description: string;
  permissions: Array<{
    id: string;
    label: string;
    description: string;
  }>;
};

export const PERMISSION_CATALOG = [
  {
    id: "organization",
    label: "Organization & projects",
    description: "Structure, settings, projects, and access administration.",
    permissions: [
      {
        id: "organization.get",
        label: "View organization",
        description: "See organization settings and structure.",
      },
      {
        id: "organization.update",
        label: "Manage organization",
        description: "Change organization settings.",
      },
      {
        id: "workspaces.get",
        label: "View projects",
        description: "Open projects in the organization.",
      },
      {
        id: "workspaces.create",
        label: "Create projects",
        description: "Create new projects inside the organization.",
      },
      {
        id: "workspaces.update",
        label: "Manage projects",
        description: "Change project settings and lifecycle.",
      },
      {
        id: "members.manage",
        label: "Manage members",
        description: "Add members and update their access.",
      },
      {
        id: "teams.manage",
        label: "Manage teams",
        description: "Create teams and manage team membership.",
      },
      {
        id: "roles.manage",
        label: "Manage access",
        description: "Create roles and assign them to members or teams.",
      },
    ],
  },
  {
    id: "assistants",
    label: "Assistants & conversations",
    description: "Build, run, and delegate AI assistants.",
    permissions: [
      {
        id: "agents.view",
        label: "View assistants",
        description: "List and inspect assistants.",
      },
      {
        id: "agents.chat",
        label: "Use assistants",
        description: "Start conversations and run assistants.",
      },
      {
        id: "agents.create",
        label: "Create assistants",
        description: "Create and configure assistants.",
      },
      {
        id: "agents.update",
        label: "Edit assistants",
        description: "Update existing assistants.",
      },
      {
        id: "agents.delete",
        label: "Delete assistants",
        description: "Permanently remove assistants.",
      },
      {
        id: "agents.delegate",
        label: "Delegate to specialists",
        description: "Allow orchestrators to run specialist assistants.",
      },
      {
        id: "agentVersions.create",
        label: "Create assistant versions",
        description: "Save new versions of assistants.",
      },
      {
        id: "agentVersions.manage",
        label: "Manage assistant versions",
        description: "Administer all assistant versions.",
      },
      {
        id: "conversations.create",
        label: "Create conversations",
        description: "Start new project conversations.",
      },
      {
        id: "conversations.viewOwn",
        label: "View own conversations",
        description: "Read conversations created by the member.",
      },
      {
        id: "conversations.manage",
        label: "Manage all conversations",
        description: "Administer conversations across the project.",
      },
    ],
  },
  {
    id: "platform",
    label: "Models, tools & knowledge",
    description: "AI providers, tools, integrations, and knowledge bases.",
    permissions: [
      {
        id: "providers.viewMetadata",
        label: "View AI connections",
        description: "See configured providers without secrets.",
      },
      {
        id: "providers.manage",
        label: "Manage AI connections",
        description: "Create, test, update, and delete providers.",
      },
      {
        id: "models.view",
        label: "View models",
        description: "See models available in the project.",
      },
      {
        id: "models.invoke",
        label: "Use models",
        description: "Invoke configured models.",
      },
      {
        id: "models.manage",
        label: "Manage models",
        description: "Sync and configure model availability.",
      },
      {
        id: "tools.view",
        label: "View tools",
        description: "See tools and integrations.",
      },
      {
        id: "tools.configure",
        label: "Configure tools",
        description: "Change tool and approval settings.",
      },
      {
        id: "tools.executeRestricted",
        label: "Run restricted tools",
        description: "Execute tools that require elevated access.",
      },
      {
        id: "mcpServers.get",
        label: "View integrations",
        description: "See configured MCP servers and connections.",
      },
      {
        id: "mcpServers.manage",
        label: "Manage integrations",
        description: "Configure MCP servers and connections.",
      },
      {
        id: "knowledgeBases.viewAllowed",
        label: "View allowed knowledge",
        description: "Read knowledge bases shared with the member.",
      },
      {
        id: "knowledgeBases.manage",
        label: "Manage knowledge",
        description: "Create and update knowledge bases.",
      },
    ],
  },
  {
    id: "automation",
    label: "Workflows",
    description: "Design, publish, and execute automated workflows.",
    permissions: [
      {
        id: "workflows.view",
        label: "View workflows",
        description: "List workflows and inspect their runs.",
      },
      {
        id: "workflows.create",
        label: "Create workflows",
        description: "Create new workflow drafts.",
      },
      {
        id: "workflows.update",
        label: "Edit workflows",
        description: "Edit and publish workflows.",
      },
      {
        id: "workflows.execute",
        label: "Run workflows",
        description: "Start workflow executions.",
      },
      {
        id: "workflows.delete",
        label: "Delete workflows",
        description: "Permanently remove workflows.",
      },
    ],
  },
  {
    id: "governance",
    label: "Governance & credentials",
    description: "Usage, audit, marketplace publishing, and API credentials.",
    permissions: [
      {
        id: "usage.view",
        label: "View usage",
        description: "See consumption and quota.",
      },
      {
        id: "audit.view",
        label: "View audit log",
        description: "Review security-sensitive events.",
      },
      {
        id: "audit.export",
        label: "Export audit log",
        description: "Download audit events.",
      },
      {
        id: "marketplaceItems.view",
        label: "View marketplace items",
        description: "Browse resources available in the marketplace.",
      },
      {
        id: "marketplaceItems.install",
        label: "Install marketplace items",
        description: "Add shared resources to the project.",
      },
      {
        id: "marketplaceItems.publish",
        label: "Publish marketplace items",
        description: "Share project resources through the marketplace.",
      },
      {
        id: "apiKeys.manageOwn",
        label: "Manage own API keys",
        description: "Create credentials limited to the member's access.",
      },
      {
        id: "apiKeys.manage",
        label: "Manage all API keys",
        description: "Administer credentials for the project.",
      },
    ],
  },
] as const satisfies readonly PermissionCatalogGroup[];

export const KNOWN_PERMISSIONS = new Set<string>(
  PERMISSION_CATALOG.flatMap((group) =>
    group.permissions.map((permission) => permission.id),
  ),
);

export function isKnownPermission(permission: string) {
  return KNOWN_PERMISSIONS.has(permission);
}

function permissionGrantMatches(grant: string, permission: string) {
  if (grant === "*" || grant === permission) return true;
  if (!grant.endsWith(".*")) return false;
  return permission.startsWith(grant.slice(0, -1));
}

export function expandPermissionGrants(grants: readonly string[]) {
  return [...KNOWN_PERMISSIONS].filter((permission) =>
    grants.some((grant) => permissionGrantMatches(grant, permission)),
  );
}

const ORGANIZATION_ONLY_PERMISSIONS = new Set([
  "organization.get",
  "organization.update",
  "workspaces.create",
  "members.manage",
  "teams.manage",
]);

export function isPermissionCompatibleWithScope(
  permission: string,
  scopeType: "organization" | "workspace",
) {
  return (
    scopeType === "organization" ||
    !ORGANIZATION_ONLY_PERMISSIONS.has(permission)
  );
}
