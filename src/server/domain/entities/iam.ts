type Permission = string;

export interface Role {
	id: string;
	scopeType: "system" | "organization" | "workspace";
	ownerResourceType?: "organization" | "workspace";
	ownerResourceId?: string;
	name: string;
	displayName: string;
	description?: string;
	permissions: Permission[];
	isSystem: boolean;
	createdById?: string;
	createdAt: Date;
	updatedAt: Date;
}

const TENANT_USER_PERMISSIONS: Permission[] = [
	"workspaces.get",
	"providers.viewMetadata",
	"models.view",
	"agents.list",
	"agents.get",
	"agents.chat",
	"agents.create",
	"agents.update",
	"agents.delete",
	"agents.test",
	"agents.delegate",
	"agentVersions.create",
	"tools.view",
	"tools.configure",
	"tools.executeRestricted",
	"mcpServers.get",
	"mcpServers.manage",
	"knowledgeBases.viewAllowed",
	"knowledgeBases.manage",
	"conversations.create",
	"conversations.viewOwn",
	"marketplaceItems.view",
	"marketplaceItems.install",
	"marketplaceItems.publish",
	"apiKeys.manageOwn",
];

const TENANT_ADMIN_PERMISSIONS: Permission[] = [
	"workspaces.get",
	"workspaces.update",
	"roles.manage",
	"providers.manage",
	"providers.viewMetadata",
	"providers.create",
	"providers.update",
	"providers.delete",
	"providers.test",
	"models.manage",
	"models.view",
	"models.create",
	"models.update",
	"models.delete",
	"models.sync",
	"agents.manage",
	"agents.list",
	"agents.get",
	"agents.chat",
	"agents.create",
	"agents.update",
	"agents.delete",
	"agents.test",
	"agents.delegate",
	"agentVersions.manage",
	"agentVersions.create",
	"tools.manage",
	"tools.view",
	"tools.configure",
	"tools.executeRestricted",
	"mcpServers.manage",
	"mcpServers.get",
	"knowledgeBases.manage",
	"knowledgeBases.viewAllowed",
	"conversations.manage",
	"conversations.create",
	"conversations.viewOwn",
	"usage.view",
	"audit.view",
	"audit.export",
	"marketplaceItems.view",
	"marketplaceItems.install",
	"marketplaceItems.publish",
	"apiKeys.manage",
];

// ─── Built-in tenant role definitions ─────────────────────────────────

export const SYSTEM_ROLES: Omit<Role, "createdAt" | "updatedAt">[] = [
	{
		id: "", // assigned by DB
		scopeType: "organization",
		name: "organization.admin",
		displayName: "Organization Admin",
		description: "Can administer organization-level settings.",
		permissions: [
			"organization.get",
			"organization.update",
			"workspaces.create",
			"workspaces.update",
			"roles.manage",
			"audit.view",
		],
		isSystem: true,
	},
	{
		id: "",
		scopeType: "organization",
		name: "organization.user",
		displayName: "Organization User",
		description: "Can access organization resources they are a member of.",
		permissions: ["organization.get", "workspaces.get"],
		isSystem: true,
	},
	{
		id: "",
		scopeType: "workspace",
		name: "workspace.admin",
		displayName: "Tenant Admin",
		description:
			"Can administer tenant-wide configuration and global resources.",
		permissions: TENANT_ADMIN_PERMISSIONS,
		isSystem: true,
	},
	{
		id: "",
		scopeType: "workspace",
		name: "workspace.member",
		displayName: "Tenant User",
		description:
			"Can use the tenant and manage only resources they own unless an admin makes a resource global.",
		permissions: TENANT_USER_PERMISSIONS,
		isSystem: true,
	},
];
