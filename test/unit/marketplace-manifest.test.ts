import { describe, it, expect } from "vitest";
import {
	buildMcpPresetManifest,
	buildSkillManifest,
} from "@/modules/marketplace/manifest-builders";
import { skillFileStats } from "@/modules/marketplace/manifest-types";
import { installPostInstallFlags } from "@/modules/marketplace/install-helpers";
import {
	containsMarketplaceSecretMaterial,
	sanitizeMarketplaceManifest,
} from "@/modules/marketplace/manifest-sanitizer";

const baseServer = {
	id: "srv-1",
	workspaceId: "ws-1",
	createdById: "user-1",
	name: "Test Server",
	transport: "sse" as const,
	command: null,
	argsJson: null,
	url: "https://mcp.example.com",
	encryptedHeadersJson: { Authorization: "enc" },
	encryptedEnvJson: null,
	enabled: true,
	isGlobal: false,
	requireApproval: false,
	healthStatus: "healthy",
	lastCheckedAt: null,
	archivedAt: null,
	createdAt: new Date(),
	updatedAt: new Date(),
};

const baseTool = {
	id: "tool-1",
	mcpServerId: "srv-1",
	name: "search",
	description: "Search the web",
	inputSchemaJson: { type: "object" },
	outputSchemaJson: null,
	enabled: true,
	requireApproval: false,
	discoveredAt: new Date(),
	createdAt: new Date(),
	updatedAt: new Date(),
};

const baseSkill = {
	id: "skill-1",
	workspaceId: "ws-1",
	createdById: "user-1",
	name: "My Skill",
	description: "A skill",
	sourcePackage: null,
	sourceSkillName: null,
	installCommand: null,
	isGlobal: false,
	markdownFilesJson: [{ path: "SKILL.md", content: "# Hello" }],
	metadataJson: null,
	archivedAt: null,
	createdAt: new Date(),
	updatedAt: new Date(),
};

describe("skillFileStats", () => {
	it("counts files and bytes", () => {
		const stats = skillFileStats([
			{ path: "a.md", content: "abc" },
			{ path: "b.md", content: "de" },
		]);
		expect(stats.fileCount).toBe(2);
		expect(stats.totalBytes).toBe(5);
	});
});

describe("buildSkillManifest", () => {
	it("includes file stats in manifest", () => {
		const manifest = buildSkillManifest(baseSkill, "My Skill", "desc");
		expect(manifest.type).toBe("skill");
		expect(manifest.skill.fileCount).toBe(1);
		expect(manifest.skill.totalBytes).toBe(7);
		expect(manifest.skill.markdownFiles[0].content).toBe("# Hello");
	});
});

describe("buildMcpPresetManifest", () => {
	it("exports credential schema without credential values", () => {
		const manifest = buildMcpPresetManifest(
			"Test Server",
			null,
			baseServer,
			[baseTool],
			"server",
		);
		expect(manifest.preset.requiresCredentials).toBe(true);
		expect(manifest.preset).not.toHaveProperty("secretsIncluded");
		expect(manifest.preset).not.toHaveProperty("encryptedHeadersJson");
		expect(manifest.preset.credentialSchema).toEqual([
			expect.objectContaining({ key: "header:Authorization" }),
		]);
		expect(manifest.preset.tools[0].name).toBe("search");
		expect(manifest.preset.enabled).toBe(true);
	});
});

describe("sanitizeMarketplaceManifest", () => {
	it("recursively strips historical encrypted and plain secret material", () => {
		const sanitized = sanitizeMarketplaceManifest({
			type: "agent",
			name: "legacy",
			agent: {},
			bundledResources: {
				mcpPresets: [
					{
						type: "mcp_preset",
						preset: {
							credentialSchema: [{ key: "API_KEY", label: "API key" }],
							encryptedHeadersJson: { Authorization: "ciphertext" },
							encryptedEnvJson: { API_KEY: "ciphertext" },
							secretsIncluded: true,
						},
					},
				],
				customTools: [
					{
						tool: {
							credentialSchema: [{ key: "TOKEN", label: "Token" }],
							encryptedCredentialRefs: [
								{ encryptedPayload: "ciphertext" },
							],
							metadata: { clientSecret: "plaintext" },
						},
					},
				],
			},
		});

		expect(containsMarketplaceSecretMaterial(sanitized)).toBe(false);
		expect(JSON.stringify(sanitized)).not.toContain("ciphertext");
		expect(JSON.stringify(sanitized)).not.toContain("plaintext");
		expect(JSON.stringify(sanitized)).toContain("credentialSchema");
		expect(
			sanitizeMarketplaceManifest({
				type: "agent",
				name: "bounded",
				agent: { maxOutputTokens: 4_000 },
			}),
		).toMatchObject({ agent: { maxOutputTokens: 4_000 } });
	});
});

describe("installPostInstallFlags", () => {
	it("flags missing credentials on mcp preset", () => {
		const flags = installPostInstallFlags({
			type: "mcp_preset",
			name: "x",
			preset: {
				scope: "server",
				serverName: "s",
				transport: "stdio",
				enabled: true,
				requireApproval: false,
				requiresCredentials: true,
				tools: [],
			},
		});
		expect(flags.requiresCredentials).toBe(true);
	});

	it("never treats a legacy included-secret marker as portable credentials", () => {
		const flags = installPostInstallFlags({
			type: "custom_tool",
			name: "t",
			tool: {
				requiresCredentials: true,
				secretsIncluded: true,
			},
		} as never);
		expect(flags.requiresCredentials).toBe(true);
	});
});
