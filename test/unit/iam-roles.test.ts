import { describe, expect, it } from "vitest";
import { SYSTEM_ROLES } from "@/server/domain/entities/iam";

describe("SYSTEM_ROLES", () => {
	it("defines at least one organization and workspace scope role", () => {
		const orgRoles = SYSTEM_ROLES.filter((r) => r.scopeType === "organization");
		const wsRoles = SYSTEM_ROLES.filter((r) => r.scopeType === "workspace");
		expect(orgRoles.length).toBeGreaterThan(0);
		expect(wsRoles.length).toBeGreaterThan(0);
	});

	it("every role has required fields", () => {
		for (const role of SYSTEM_ROLES) {
			expect(role.name).toBeTruthy();
			expect(role.displayName).toBeTruthy();
			expect(Array.isArray(role.permissions)).toBe(true);
			expect(role.isSystem).toBe(true);
			expect(["organization", "workspace"]).toContain(role.scopeType);
		}
	});

	it("every role has at least one permission", () => {
		for (const role of SYSTEM_ROLES) {
			expect(role.permissions.length).toBeGreaterThan(0);
		}
	});

	it("defines only tenant admin and tenant user workspace roles", () => {
		const workspaceRoleNames = SYSTEM_ROLES.filter(
			(r) => r.scopeType === "workspace",
		).map((role) => role.name);
		expect(workspaceRoleNames.sort()).toEqual([
			"workspace.admin",
			"workspace.member",
		]);
	});

	it("workspace.member has restricted permissions", () => {
		const member = SYSTEM_ROLES.find((r) => r.name === "workspace.member");
		expect(member).toBeDefined();
		expect(member!.permissions).not.toContain("members.*");
		expect(member!.permissions).not.toContain("providers.*");
	});

	it("defines only organization admin and organization user roles", () => {
		const organizationRoleNames = SYSTEM_ROLES.filter(
			(r) => r.scopeType === "organization",
		).map((role) => role.name);
		expect(organizationRoleNames.sort()).toEqual([
			"organization.admin",
			"organization.user",
		]);
	});

	it("role names are unique", () => {
		const names = SYSTEM_ROLES.map((r) => r.name);
		const unique = new Set(names);
		expect(unique.size).toBe(names.length);
	});

	it("workspace roles do not include legacy owner/developer/viewer roles", () => {
		expect(SYSTEM_ROLES.some((role) => role.name.includes("owner"))).toBe(
			false,
		);
		expect(SYSTEM_ROLES.some((role) => role.name.includes("developer"))).toBe(
			false,
		);
		expect(SYSTEM_ROLES.some((role) => role.name.includes("viewer"))).toBe(
			false,
		);
	});

	it("workspace roles do not include member-management permissions", () => {
		for (const role of SYSTEM_ROLES.filter(
			(item) => item.scopeType === "workspace",
		)) {
			expect(role.permissions).not.toContain("members.*");
			expect(role.permissions).not.toContain("members.invite");
			expect(role.permissions).not.toContain("members.manage");
		}
	});
});
