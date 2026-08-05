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

vi.mock("@/server/domain/services/audit", () => ({
	audit: { emit: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock("@/lib/logger", () => ({
	logHandledError: vi.fn(),
}));

export const authorizationMocks = vi.hoisted(() => ({
	hasPermission: vi.fn().mockResolvedValue(false),
}));

vi.mock("@/server/domain/services/authorization", () => ({
	authorization: { hasPermission: authorizationMocks.hasPermission },
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

export const dbModule = _dbModule as unknown as DbModule;

export function resetDb() {
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
	authorizationMocks.hasPermission.mockResolvedValue(false);
	resetDb();
});

export const ownSkill = {
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
