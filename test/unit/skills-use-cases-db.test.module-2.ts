import { beforeEach, describe, expect, it, vi } from "vitest";

import * as _dbModule from "@/server/infrastructure/db";
import {
	archiveAgentSkill,
	buildSkillsRegistryPrompt,
	cloneSkillBindings,
	createSkillManually,
	getSkillBindingsForVersion,
	listAgentSkills,
	loadBoundSkillContent,
	replaceSkillBindingsForVersion,
	updateSkillManually,
} from "@/modules/skills/use-cases";
import { authorizationMocks, dbModule, ownSkill, resetDb } from "./skills-use-cases-db.test.authorization-mocks";


describe("skill bindings", () => {
	it("loads visible bindings", async () => {
		dbModule._c.where.mockResolvedValueOnce([
			{
				id: "binding-1",
				skillId: "skill-1",
				name: "research",
				createdById: "user-1",
				isGlobal: false,
			},
		]);
		await expect(
			getSkillBindingsForVersion("version-1", {
				workspaceId: "ws-1",
				userId: "user-1",
			}),
		).resolves.toEqual([
			{ id: "binding-1", skillId: "skill-1", name: "research" },
		]);
	});

	it("replaces, clears, validates, and clones bindings", async () => {
		await replaceSkillBindingsForVersion("version-1", "ws-1", []);
		expect(dbModule.db.delete).toHaveBeenCalled();

		resetDb();
		dbModule._c.where.mockResolvedValueOnce([
			{ id: "skill-1", createdById: "user-1", isGlobal: false },
		]);
		await expect(
			replaceSkillBindingsForVersion(
				"version-1",
				"ws-1",
				["skill-1", "skill-1"],
				{
					userId: "user-1",
				},
			),
		).resolves.toBeUndefined();
		expect(dbModule._c.values).toHaveBeenCalledWith([
			{ agentVersionId: "version-1", skillId: "skill-1" },
		]);

		resetDb();
		dbModule._c.where.mockResolvedValueOnce([{ id: "skill-1" }]);
		await expect(
			replaceSkillBindingsForVersion("version-1", "ws-1", ["missing"]),
		).rejects.toThrow("Skill not found");

		resetDb();
		await cloneSkillBindings(null, "version-2");
		expect(dbModule.db.select).not.toHaveBeenCalled();

		resetDb();
		dbModule._c.where.mockResolvedValueOnce([
			{
				id: "skill-1",
				skillId: "skill-1",
				createdById: "user-1",
				isGlobal: false,
			},
			{
				id: "skill-2",
				skillId: "skill-2",
				createdById: "other",
				isGlobal: true,
			},
		]);
		await cloneSkillBindings("version-1", "version-2", "ws-1", {
			userId: "user-1",
		});
		expect(dbModule._c.values).toHaveBeenCalledWith([
			{ agentVersionId: "version-2", skillId: "skill-1" },
			{ agentVersionId: "version-2", skillId: "skill-2" },
		]);
	});

	it("binds a skill shared through IAM", async () => {
		authorizationMocks.hasPermission.mockResolvedValue(true);
		dbModule._c.where.mockResolvedValueOnce([
			{
				id: "skill-shared",
				createdById: "another-user",
				isGlobal: false,
			},
		]);

		await expect(
			replaceSkillBindingsForVersion(
				"version-2",
				"ws-1",
				["skill-shared"],
				{ userId: "existing-user" },
			),
		).resolves.toBeUndefined();
		expect(authorizationMocks.hasPermission).toHaveBeenCalledWith(
			{ principalType: "user", principalId: "existing-user" },
			"tools.view",
			"skill",
			"skill-shared",
		);
	});
});

describe("manual skill management", () => {
	it("creates skills with normalized markdown and audit metadata", async () => {
		dbModule._c.returning.mockResolvedValueOnce([ownSkill]);

		const result = await createSkillManually({
			workspaceId: "ws-1",
			userId: "user-1",
			name: "research",
			description: "Research skill",
			markdownFiles: [
				{ path: "/guide.md", content: "Guide" },
				{ path: "notes.txt", content: "ignored" },
			],
			isGlobal: true,
		});

		expect(result).toBe(ownSkill);
		expect(dbModule._c.values).toHaveBeenCalledWith(
			expect.objectContaining({
				name: "research",
				isGlobal: true,
				markdownFilesJson: expect.arrayContaining([
					expect.objectContaining({ path: "SKILL.md" }),
					expect.objectContaining({ path: "guide.md", content: "Guide" }),
				]),
			}),
		);
	});

	it("updates manageable skills and rejects unauthorized global changes", async () => {
		dbModule._c.limit.mockResolvedValueOnce([
			{ ...ownSkill, createdById: "other", isGlobal: false },
		]);
		await expect(
			updateSkillManually({
				workspaceId: "ws-1",
				userId: "user-1",
				skillId: "skill-1",
				name: "research",
				description: "Research skill",
				markdownFiles: [{ path: "SKILL.md", content: "# Skill" }],
			}),
		).rejects.toThrow("Skill not found");

		resetDb();
		dbModule._c.limit.mockResolvedValueOnce([ownSkill]);
		await expect(
			updateSkillManually({
				workspaceId: "ws-1",
				userId: "user-1",
				skillId: "skill-1",
				name: "research",
				description: "Research skill",
				markdownFiles: [{ path: "SKILL.md", content: "# Skill" }],
				isGlobal: true,
			}),
		).rejects.toThrow("Only admins can make skills global");

		resetDb();
		dbModule._c.limit.mockResolvedValueOnce([ownSkill]);
		dbModule._c.returning.mockResolvedValueOnce([
			{ ...ownSkill, description: "Updated" },
		]);
		await expect(
			updateSkillManually({
				workspaceId: "ws-1",
				userId: "user-1",
				skillId: "skill-1",
				name: "research",
				description: "Updated",
				markdownFiles: [{ path: "SKILL.md", content: "# Skill" }],
				isGlobal: false,
			}),
		).resolves.toMatchObject({ description: "Updated" });
	});
});
