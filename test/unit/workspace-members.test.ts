import { beforeAll, describe, expect, it } from "vitest";

let matchesPermission: (
	grantedPermission: string,
	requiredPermission: string,
) => boolean;

type RoleWithPermissions = {
	scopeType: string;
	permissions: string[];
};

function isWorkspaceRole(role: RoleWithPermissions) {
	return role.scopeType === "workspace";
}

function roleHasPermission(
	role: { permissions: string[] } | undefined,
	requiredPermission: string,
) {
	return Boolean(
		role?.permissions.some((permission) =>
			matchesPermission(permission, requiredPermission),
		),
	);
}

beforeAll(async () => {
	process.env.APP_ENCRYPTION_KEY =
		"0000000000000000000000000000000000000000000000000000000000000000";
	process.env.APP_ENCRYPTION_KEY_ID = "default";
	process.env.BETTER_AUTH_SECRET = "test-secret-min-32-chars-long";
	process.env.BETTER_AUTH_URL = "http://localhost:3000";
	process.env.BETTER_AUTH_TRUSTED_ORIGINS = "http://localhost:3000";
	process.env.DATABASE_URL = "postgres://localhost/test";
	process.env.OBJECT_STORAGE_BUCKET = "test";
	process.env.OBJECT_STORAGE_ACCESS_KEY_ID = "test";
	process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY = "test";

	({ matchesPermission } = await import(
		"@/server/domain/services/authorization"
	));
});

describe("workspace IAM", () => {
	it("does not grant workspace member-management permissions", async () => {
		const { SYSTEM_ROLES } = await import("@/server/domain/entities/iam");
		for (const role of SYSTEM_ROLES.filter(isWorkspaceRole)) {
			expect(roleHasPermission(role, "members.invite")).toBe(false);
			expect(roleHasPermission(role, "members.remove")).toBe(false);
		}
	});

	it("keeps app-management permissions for hidden primary workspace access", async () => {
		const { SYSTEM_ROLES } = await import("@/server/domain/entities/iam");
		const adminRole = SYSTEM_ROLES.find(
			(role) => role.name === "workspace.admin",
		);
		const memberRole = SYSTEM_ROLES.find(
			(role) => role.name === "workspace.member",
		);
		const memberPermissions = [
			"agents.chat",
			"tools.executeRestricted",
			"providers.viewMetadata",
			"models.view",
			"apiKeys.manageOwn",
		];
		const adminOnlyPermissions = ["apiKeys.manage", "roles.manage"];

		for (const requiredPermission of memberPermissions) {
			expect(roleHasPermission(memberRole, requiredPermission)).toBe(true);
			expect(roleHasPermission(adminRole, requiredPermission)).toBe(true);
		}

		for (const requiredPermission of adminOnlyPermissions) {
			expect(roleHasPermission(adminRole, requiredPermission)).toBe(true);
			expect(roleHasPermission(memberRole, requiredPermission)).toBe(false);
		}
	});
});
