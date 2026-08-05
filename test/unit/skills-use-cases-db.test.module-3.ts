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
import { dbModule, resetDb } from "./skills-use-cases-db.test.authorization-mocks";


describe("skill prompts and content", () => {
	it("builds registry prompts and returns null when no skills are bound", async () => {
		dbModule._c.orderBy.mockResolvedValueOnce([]);
		await expect(buildSkillsRegistryPrompt("version-1")).resolves.toBeNull();

		resetDb();
		dbModule._c.orderBy.mockResolvedValueOnce([
			{ name: "research", description: "Research the web" },
			{ name: "writer", description: null },
		]);
		const prompt = await buildSkillsRegistryPrompt("version-1");
		expect(prompt).toContain("research: Research the web");
		expect(prompt).toContain("writer: No description provided");
	});

	it("omits skills disabled for the current conversation", async () => {
		dbModule._c.orderBy.mockResolvedValueOnce([
			{ id: "skill-1", name: "research", description: "Research the web" },
			{ id: "skill-2", name: "writer", description: "Write clearly" },
		]);

		const prompt = await buildSkillsRegistryPrompt(
			"version-1",
			new Set(["skill-1"]),
		);

		expect(prompt).not.toContain("research");
		expect(prompt).toContain("writer: Write clearly");
	});

	it("loads bound skill content by case-insensitive name", async () => {
		dbModule._c.where.mockResolvedValueOnce([
			{
				skill: {
					name: "Research",
					description: "Research skill",
					markdownFilesJson: [
						{ path: "SKILL.md", content: "# Research\nSteps" },
						{ path: "notes.txt", content: "ignored" },
						{ path: "details.md", content: "More" },
					],
				},
			},
		]);

		const found = await loadBoundSkillContent({
			agentVersionId: "version-1",
			skillName: " research ",
		});
		expect(found).toMatchObject({ found: true, name: "Research" });
		expect(found.content).toContain("## File: SKILL.md");
		expect(found.content).toContain("## File: details.md");

		resetDb();
		dbModule._c.where.mockResolvedValueOnce([]);
		await expect(
			loadBoundSkillContent({
				agentVersionId: "version-1",
				skillName: "missing",
			}),
		).resolves.toMatchObject({ found: false });
	});
});
