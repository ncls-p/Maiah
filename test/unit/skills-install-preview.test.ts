import { beforeEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const execMocks = vi.hoisted(() => ({ execFile: vi.fn() }));

vi.mock("node:child_process", () => ({
	execFile: execMocks.execFile,
}));

vi.mock("@/server/domain/services/audit", () => ({
	audit: { emit: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock("@/lib/logger", () => ({
	logHandledError: vi.fn(),
}));

type Chain = {
	insert: ReturnType<typeof vi.fn>;
	values: ReturnType<typeof vi.fn>;
	returning: ReturnType<typeof vi.fn>;
};
function makeChain(): Chain {
	return {
		insert: vi.fn().mockReturnThis(),
		values: vi.fn().mockReturnThis(),
		returning: vi.fn().mockResolvedValue([]),
	};
}
type DbModule = {
	db: {
		insert: ReturnType<typeof vi.fn>;
		transaction: ReturnType<typeof vi.fn>;
	};
	_c: Chain;
};
vi.mock("@/server/infrastructure/db", () => {
	const chain = makeChain();
	const insert = vi.fn();
	return {
		db: {
			insert,
			transaction: vi.fn(async (callback) => callback({ insert })),
		},
		_c: chain,
	};
});

import { logHandledError } from "@/lib/logger";
import * as _dbModule from "@/server/infrastructure/db";
import {
	createSkillInstallPreviewToken,
	installSkillsFromCommand,
	previewSkillInstall,
	SkillPreviewConflictError,
	verifySkillInstallPreviewToken,
} from "@/modules/skills/use-cases";

const dbModule = _dbModule as unknown as DbModule;

function createInstalledSkillTree(tempDir: string, suffix = "") {
	const skillDir = path.join(tempDir, ".claude", "skills", "research-skill");
	mkdirSync(path.join(skillDir, "docs"), { recursive: true });
	writeFileSync(
		path.join(skillDir, "SKILL.md"),
		`---\nname: research-skill\ndescription: Research things\n---\n\n# Research\nUse sources.${suffix}`,
	);
	writeFileSync(path.join(skillDir, "docs", "guide.md"), "# Guide\nDetails");
	writeFileSync(path.join(skillDir, "ignored.txt"), "ignore");
}

beforeEach(() => {
	vi.clearAllMocks();
	dbModule.db.insert.mockReset().mockReturnValue(dbModule._c);
	dbModule.db.transaction
		.mockReset()
		.mockImplementation(async (callback) =>
			callback({ insert: dbModule.db.insert }),
		);
	dbModule._c.insert.mockReset().mockReturnThis();
	dbModule._c.values.mockReset().mockReturnThis();
	dbModule._c.returning
		.mockReset()
		.mockResolvedValue([{ id: "skill-1", name: "research-skill" }]);
	execMocks.execFile.mockImplementation((_cmd, _args, options, callback) => {
		createInstalledSkillTree(options.cwd);
		callback(null, { stdout: "\u001b[32minstalled\u001b[0m", stderr: "" });
	});
});

describe("skills install and preview", () => {
	it("previews installed skills from copied markdown", async () => {
		const result = await previewSkillInstall(
			"npx skills add owner/repo --skill research-skill",
		);

		expect(result).toEqual([
			expect.objectContaining({
				name: "research-skill",
				description: "Research things",
				sourcePackage: "owner/repo",
				markdownFiles: [
					expect.objectContaining({ path: "SKILL.md" }),
					expect.objectContaining({ path: "docs/guide.md" }),
				],
			}),
		]);
		expect(execMocks.execFile).toHaveBeenCalledWith(
			"npx",
			expect.arrayContaining([
				"skills",
				"add",
				"owner/repo",
				"--skill",
				"research-skill",
			]),
			expect.objectContaining({
				env: expect.objectContaining({ GIT_TERMINAL_PROMPT: "0" }),
			}),
			expect.any(Function),
		);
	});

	it("installs skills into the database and stores sanitized CLI output", async () => {
		const installCommand = "npx skills add owner/repo@research-skill";
		const skills = await previewSkillInstall(installCommand);
		const { previewToken } = createSkillInstallPreviewToken({
			workspaceId: "ws-1",
			userId: "user-1",
			installCommand,
			skills,
		});
		const rows = await installSkillsFromCommand({
			workspaceId: "ws-1",
			userId: "user-1",
			installCommand,
			previewToken,
			isGlobal: true,
		});

		expect(rows).toEqual([{ id: "skill-1", name: "research-skill" }]);
		expect(dbModule._c.values).toHaveBeenCalledWith(
			expect.objectContaining({
				workspaceId: "ws-1",
				isGlobal: true,
				name: "research-skill",
				description: "Research things",
				sourcePackage: "owner/repo",
				metadataJson: expect.objectContaining({ installOutput: "installed\n" }),
			}),
		);
		expect(dbModule.db.transaction).toHaveBeenCalledOnce();
	});

	it("rejects a source that changed after preview before writing anything", async () => {
		const installCommand = "npx skills add owner/repo@research-skill";
		const skills = await previewSkillInstall(installCommand);
		const { previewToken } = createSkillInstallPreviewToken({
			workspaceId: "ws-1",
			userId: "user-1",
			installCommand,
			skills,
		});
		execMocks.execFile.mockImplementationOnce(
			(_cmd, _args, options, callback) => {
				createInstalledSkillTree(options.cwd, " Changed after review.");
				callback(null, { stdout: "installed", stderr: "" });
			},
		);

		await expect(
			installSkillsFromCommand({
				workspaceId: "ws-1",
				userId: "user-1",
				installCommand,
				previewToken,
			}),
		).rejects.toBeInstanceOf(SkillPreviewConflictError);
		expect(dbModule.db.transaction).not.toHaveBeenCalled();
		expect(dbModule._c.values).not.toHaveBeenCalled();
	});

	it("binds preview tokens to the user, workspace, command, and expiry", async () => {
		const installCommand = "npx skills add owner/repo@research-skill";
		const skills = await previewSkillInstall(installCommand);
		const { previewToken } = createSkillInstallPreviewToken({
			workspaceId: "ws-1",
			userId: "user-1",
			installCommand,
			skills,
			now: 1_000,
		});

		expect(() =>
			verifySkillInstallPreviewToken({
				previewToken,
				workspaceId: "ws-2",
				userId: "user-1",
				installCommand,
				now: 2_000,
			}),
		).toThrow(SkillPreviewConflictError);
		expect(() =>
			verifySkillInstallPreviewToken({
				previewToken,
				workspaceId: "ws-1",
				userId: "user-1",
				installCommand,
				now: 11 * 60_000,
			}),
		).toThrow(/expired/i);
		expect(() =>
			verifySkillInstallPreviewToken({
				previewToken: `${previewToken.slice(0, -1)}x`,
				workspaceId: "ws-1",
				userId: "user-1",
				installCommand,
				now: 2_000,
			}),
		).toThrow(SkillPreviewConflictError);
	});

	it("logs and rethrows CLI failures", async () => {
		execMocks.execFile.mockImplementationOnce(
			(_cmd, _args, _options, callback) => {
				const error = new Error("failed") as Error & {
					code: number;
					stdout: Buffer;
					stderr: string;
				};
				error.code = 1;
				error.stdout = Buffer.from("out");
				error.stderr = "err";
				callback(error);
			},
		);

		await expect(
			previewSkillInstall("npx skills add owner/repo --skill bad"),
		).rejects.toThrow("Skill CLI failed (exit 1): out\nerr");
		expect(logHandledError).toHaveBeenCalledWith(
			"Failed to preview skill install",
			expect.objectContaining({ sourcePackage: "owner/repo" }),
			expect.any(Error),
		);
	});
});
