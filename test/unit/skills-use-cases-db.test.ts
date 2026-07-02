import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/domain/services/audit", () => ({
	audit: { emit: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock("@/lib/logger", () => ({
	logHandledError: vi.fn(),
}));

type Chain = {
	select: ReturnType<typeof vi.fn>;
	insert: ReturnType<typeof vi.fn>;
	update: ReturnType<typeof vi.fn>;
	delete: ReturnType<typeof vi.fn>;
	from: ReturnType<typeof vi.fn>;
	innerJoin: ReturnType<typeof vi.fn>;
	where: ReturnType<typeof vi.fn>;
	orderBy: ReturnType<typeof vi.fn>;
	limit: ReturnType<typeof vi.fn>;
	values: ReturnType<typeof vi.fn>;
	set: ReturnType<typeof vi.fn>;
	returning: ReturnType<typeof vi.fn>;
};

function makeChain(): Chain {
	const c = {} as Chain;
	for (const key of [
		"select",
		"insert",
		"update",
		"delete",
		"from",
		"innerJoin",
		"where",
		"orderBy",
		"values",
		"set",
	] as const) {
		c[key] = vi.fn().mockReturnThis();
	}
	c.limit = vi.fn().mockResolvedValue([]);
	c.returning = vi.fn().mockResolvedValue([]);
	return c;
}

type DbModule = {
	db: {
		select: ReturnType<typeof vi.fn>;
		insert: ReturnType<typeof vi.fn>;
		update: ReturnType<typeof vi.fn>;
		delete: ReturnType<typeof vi.fn>;
	};
	_c: Chain;
};

vi.mock("@/server/infrastructure/db", () => {
	const chain = makeChain();
	return {
		db: {
			select: vi.fn(),
			insert: vi.fn(),
			update: vi.fn(),
			delete: vi.fn(),
		},
		_c: chain,
	};
});

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

const dbModule = _dbModule as unknown as DbModule;

function resetDb() {
	dbModule.db.select.mockReset().mockReturnValue(dbModule._c);
	dbModule.db.insert.mockReset().mockReturnValue(dbModule._c);
	dbModule.db.update.mockReset().mockReturnValue(dbModule._c);
	dbModule.db.delete.mockReset().mockReturnValue(dbModule._c);
	for (const key of [
		"select",
		"insert",
		"update",
		"delete",
		"from",
		"innerJoin",
		"where",
		"orderBy",
		"values",
		"set",
	] as const) {
		dbModule._c[key].mockReset().mockReturnThis();
	}
	dbModule._c.limit.mockReset().mockResolvedValue([]);
	dbModule._c.returning.mockReset().mockResolvedValue([]);
}

beforeEach(() => {
	vi.clearAllMocks();
	resetDb();
});

const ownSkill = {
	id: "skill-1",
	workspaceId: "ws-1",
	createdById: "user-1",
	name: "research",
	description: "Research skill",
	isGlobal: false,
	markdownFilesJson: [{ path: "SKILL.md", content: "# Research" }],
};

const globalSkill = {
	...ownSkill,
	id: "skill-2",
	createdById: "other",
	name: "global-skill",
	isGlobal: true,
};

describe("skill listing and archiving", () => {
	it("marks editable skills for owners, admins, and anonymous admin listings", async () => {
		dbModule._c.orderBy.mockResolvedValueOnce([ownSkill, globalSkill]);
		await expect(
			listAgentSkills("ws-1", "user-1", false),
		).resolves.toMatchObject([
			{ id: "skill-1", canEdit: true },
			{ id: "skill-2", canEdit: false },
		]);

		resetDb();
		dbModule._c.orderBy.mockResolvedValueOnce([globalSkill]);
		await expect(
			listAgentSkills("ws-1", "user-1", true),
		).resolves.toMatchObject([{ id: "skill-2", canEdit: true }]);

		resetDb();
		dbModule._c.orderBy.mockResolvedValueOnce([globalSkill]);
		await expect(
			listAgentSkills("ws-1", undefined, false),
		).resolves.toMatchObject([{ id: "skill-2", canEdit: true }]);
	});

	it("archives manageable skills and rejects missing or unauthorized skills", async () => {
		dbModule._c.limit.mockResolvedValueOnce([]);
		await expect(
			archiveAgentSkill({
				workspaceId: "ws-1",
				userId: "user-1",
				skillId: "missing",
			}),
		).rejects.toThrow("Skill not found");

		resetDb();
		dbModule._c.limit.mockResolvedValueOnce([
			{ ...ownSkill, createdById: "other", isGlobal: false },
		]);
		await expect(
			archiveAgentSkill({
				workspaceId: "ws-1",
				userId: "user-1",
				skillId: "skill-1",
			}),
		).rejects.toThrow("Skill not found");

		resetDb();
		dbModule._c.limit.mockResolvedValueOnce([ownSkill]);
		dbModule._c.returning.mockResolvedValueOnce([ownSkill]);
		await expect(
			archiveAgentSkill({
				workspaceId: "ws-1",
				userId: "user-1",
				skillId: "skill-1",
			}),
		).resolves.toBeUndefined();
		expect(dbModule.db.update).toHaveBeenCalled();
	});
});

describe("skill bindings", () => {
	it("loads visible bindings", async () => {
		dbModule._c.where.mockResolvedValueOnce([
			{ id: "binding-1", skillId: "skill-1", name: "research" },
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
		dbModule._c.where.mockResolvedValueOnce([{ id: "skill-1" }]);
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
			{ skillId: "skill-1" },
			{ skillId: "skill-2" },
		]);
		await cloneSkillBindings("version-1", "version-2", "ws-1", {
			userId: "user-1",
		});
		expect(dbModule._c.values).toHaveBeenCalledWith([
			{ agentVersionId: "version-2", skillId: "skill-1" },
			{ agentVersionId: "version-2", skillId: "skill-2" },
		]);
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
