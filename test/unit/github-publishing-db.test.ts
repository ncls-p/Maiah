import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { generateKeyPairSync } from "node:crypto";

vi.mock("@/modules/code-workspace/storage", () => ({
	getCodeWorkspaceFilesForPublish: vi.fn(),
	isTextWorkspacePath: vi.fn((filePath: string) =>
		/\.(?:txt|md|js|json|html|css)$/i.test(filePath),
	),
	normalizeWorkspacePath: vi.fn((value: string) =>
		value.replace(/^\/+|\/+$/g, ""),
	),
}));

type Chain = {
	select: ReturnType<typeof vi.fn>;
	insert: ReturnType<typeof vi.fn>;
	delete: ReturnType<typeof vi.fn>;
	from: ReturnType<typeof vi.fn>;
	where: ReturnType<typeof vi.fn>;
	orderBy: ReturnType<typeof vi.fn>;
	limit: ReturnType<typeof vi.fn>;
	values: ReturnType<typeof vi.fn>;
	onConflictDoUpdate: ReturnType<typeof vi.fn>;
	returning: ReturnType<typeof vi.fn>;
};

function makeChain(): Chain {
	const c = {} as Chain;
	for (const key of [
		"select",
		"insert",
		"delete",
		"from",
		"where",
		"orderBy",
		"values",
		"onConflictDoUpdate",
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
			delete: vi.fn(),
		},
		_c: chain,
	};
});

import * as storage from "@/modules/code-workspace/storage";
import * as _dbModule from "@/server/infrastructure/db";

const dbModule = _dbModule as unknown as DbModule;
let publishing: typeof import("@/modules/github/publishing");

function resetDb() {
	dbModule.db.select.mockReset().mockReturnValue(dbModule._c);
	dbModule.db.insert.mockReset().mockReturnValue(dbModule._c);
	dbModule.db.delete.mockReset().mockReturnValue(dbModule._c);
	for (const key of [
		"select",
		"insert",
		"delete",
		"from",
		"where",
		"orderBy",
		"values",
		"onConflictDoUpdate",
	] as const) {
		dbModule._c[key].mockReset().mockReturnThis();
	}
	dbModule._c.limit.mockReset().mockResolvedValue([]);
	dbModule._c.returning.mockReset().mockResolvedValue([]);
}

function jsonResponse(
	body: unknown,
	init: { ok?: boolean; status?: number; statusText?: string } = {},
) {
	return {
		ok: init.ok ?? true,
		status: init.status ?? 200,
		statusText: init.statusText ?? "OK",
		text: async () => JSON.stringify(body),
	} as Response;
}

const ids = {
	userId: "11111111-1111-4111-8111-111111111111",
	workspaceId: "22222222-2222-4222-8222-222222222222",
	projectId: "33333333-3333-4333-8333-333333333333",
	repositoryId: "44444444-4444-4444-8444-444444444444",
};

const repoRow = {
	id: ids.repositoryId,
	connectionId: "conn-1",
	userId: ids.userId,
	githubRepositoryId: "99",
	owner: "octo",
	name: "repo",
	fullName: "octo/repo",
	private: false,
	defaultBranch: "main",
	permissionsJson: { push: true },
};
const connectionRow = {
	id: "conn-1",
	userId: ids.userId,
	installationId: "123",
	accountLogin: "octo",
	accountType: "Organization",
	repositorySelection: "selected",
	settingsUrl: "https://github.com/settings/installations/123",
	lastSyncedAt: new Date("2025-01-01T00:00:00Z"),
	updatedAt: new Date("2025-01-01T00:00:00Z"),
};

beforeAll(async () => {
	const privateKey = generateKeyPairSync("rsa", { modulusLength: 2048 })
		.privateKey.export({ format: "pem", type: "pkcs1" })
		.toString();
	process.env.GITHUB_APP_ID = "12345";
	process.env.GITHUB_APP_SLUG = "ai-hub-test";
	process.env.GITHUB_APP_PRIVATE_KEY = privateKey;
	publishing = await import("@/modules/github/publishing");
});

beforeEach(() => {
	vi.clearAllMocks();
	resetDb();
	vi.mocked(storage.getCodeWorkspaceFilesForPublish).mockResolvedValue({
		metadata: { id: ids.projectId },
		files: [
			{
				path: "src/index.js",
				bytes: new TextEncoder().encode("console.log('ok')"),
				size: 17,
			},
			{
				path: "README.md",
				bytes: new TextEncoder().encode("# Readme"),
				size: 8,
			},
		],
	} as never);
	vi.spyOn(globalThis, "fetch").mockReset();
});

describe("GitHub publishing DB/API flows", () => {
	it("creates a GitHub App installation URL and reports user status", async () => {
		const connectUrl = publishing.createGitHubConnectUrl({
			origin: "https://app.test",
			workspaceId: ids.workspaceId,
			userId: ids.userId,
		});
		expect(connectUrl).toContain(
			"https://github.com/apps/ai-hub-test/installations/new",
		);
		expect(connectUrl).toContain("state=");

		dbModule._c.orderBy.mockResolvedValueOnce([connectionRow]);
		dbModule._c.where.mockReturnValueOnce(dbModule._c).mockResolvedValueOnce([
			{ ...repoRow, permissionsJson: { admin: true } },
			{
				...repoRow,
				id: "repo-2",
				owner: "friend",
				fullName: "friend/repo",
				permissionsJson: { pull: true },
			},
		]);

		const status = await publishing.getUserGitHubStatus({
			userId: ids.userId,
			origin: "https://app.test",
			workspaceId: ids.workspaceId,
		});

		expect(status.configured).toBe(true);
		expect(status.connectUrl).toContain(
			"https://app.test/api/workspace/github/connect",
		);
		expect(status.connections[0]).toMatchObject({
			id: "conn-1",
			installationId: "123",
		});
		expect(status.repositories).toEqual([
			expect.objectContaining({
				fullName: "friend/repo",
				access: "read",
				relationship: "collaborator",
			}),
			expect.objectContaining({
				fullName: "octo/repo",
				access: "admin",
				relationship: "account",
			}),
		]);
	});

	it("syncs an installation, stores repositories, and returns status", async () => {
		vi.mocked(globalThis.fetch)
			.mockResolvedValueOnce(
				jsonResponse({
					id: 123,
					account: { id: 10, login: "octo", type: "Organization" },
					html_url:
						"https://github.com/organizations/octo/settings/installations/123",
					repository_selection: "selected",
				}) as never,
			)
			.mockResolvedValueOnce(
				jsonResponse({
					token: "installation-token",
					expires_at: "later",
				}) as never,
			)
			.mockResolvedValueOnce(
				jsonResponse({
					repositories: [
						{
							id: 99,
							name: "repo",
							full_name: "octo/repo",
							private: false,
							default_branch: "main",
							owner: { login: "octo" },
							permissions: { push: true },
						},
					],
				}) as never,
			);
		dbModule._c.returning.mockResolvedValueOnce([connectionRow]);
		dbModule._c.orderBy.mockResolvedValueOnce([connectionRow]);
		dbModule._c.where
			.mockReturnValueOnce(dbModule._c)
			.mockReturnValueOnce(dbModule._c)
			.mockResolvedValueOnce([repoRow]);

		const status = await publishing.syncGitHubInstallation({
			userId: ids.userId,
			installationId: "123",
		});

		expect(globalThis.fetch).toHaveBeenCalledWith(
			expect.stringContaining("/app/installations/123"),
			expect.any(Object),
		);
		expect(dbModule.db.delete).toHaveBeenCalled();
		expect(dbModule._c.values).toHaveBeenCalledWith(
			expect.arrayContaining([
				expect.objectContaining({
					fullName: "octo/repo",
					permissionsJson: { push: true },
				}),
			]),
		);
		expect(status.repositories[0]).toMatchObject({
			fullName: "octo/repo",
			access: "write",
		});
	});

	it("lists branches for a repository", async () => {
		dbModule._c.limit
			.mockResolvedValueOnce([repoRow])
			.mockResolvedValueOnce([connectionRow]);
		vi.mocked(globalThis.fetch)
			.mockResolvedValueOnce(
				jsonResponse({ token: "installation-token" }) as never,
			)
			.mockResolvedValueOnce(
				jsonResponse([
					{ name: "main", protected: true, commit: { sha: "abc" } },
				]) as never,
			);

		const branches = await publishing.listGitHubBranches({
			userId: ids.userId,
			repositoryId: ids.repositoryId,
		});

		expect(branches).toEqual([{ name: "main", protected: true, sha: "abc" }]);
		expect(globalThis.fetch).toHaveBeenLastCalledWith(
			expect.stringContaining("/branches?per_page=100"),
			expect.any(Object),
		);
	});

	it("publishes a pull request with blobs, tree, commit, ref update, audit event, and prefixed files", async () => {
		dbModule._c.limit
			.mockResolvedValueOnce([repoRow])
			.mockResolvedValueOnce([connectionRow]);
		dbModule._c.returning.mockResolvedValueOnce([{ id: "event-1" }]);
		vi.mocked(globalThis.fetch)
			.mockResolvedValueOnce(
				jsonResponse({ token: "installation-token" }) as never,
			)
			.mockResolvedValueOnce(
				jsonResponse({ object: { sha: "base", type: "commit" } }) as never,
			)
			.mockResolvedValueOnce(
				jsonResponse({ tree: { sha: "tree-base" } }) as never,
			)
			.mockResolvedValueOnce(
				jsonResponse(
					{ message: "Not Found" },
					{ ok: false, status: 404, statusText: "Not Found" },
				) as never,
			)
			.mockResolvedValueOnce(jsonResponse({}) as never)
			.mockResolvedValueOnce(jsonResponse({ sha: "blob-1" }) as never)
			.mockResolvedValueOnce(jsonResponse({ sha: "blob-2" }) as never)
			.mockResolvedValueOnce(jsonResponse({ sha: "tree-new" }) as never)
			.mockResolvedValueOnce(jsonResponse({ sha: "commit-new" }) as never)
			.mockResolvedValueOnce(jsonResponse({}) as never)
			.mockResolvedValueOnce(
				jsonResponse({
					html_url: "https://github.com/octo/repo/pull/1",
				}) as never,
			);

		const result = await publishing.publishCodeWorkspaceToGitHub({
			workspaceId: ids.workspaceId,
			userId: ids.userId,
			projectId: ids.projectId,
			repositoryId: ids.repositoryId,
			mode: "pull_request",
			targetBranch: "main",
			sourceBranch: "ai-hub/test",
			targetDirectory: " packages/app/ ",
			commitMessage: "Publish workspace",
			pullRequestTitle: "Publish PR",
		});

		expect(result).toMatchObject({
			mode: "pull_request",
			repository: "octo/repo",
			targetBranch: "main",
			sourceBranch: "ai-hub/test",
			commitSha: "commit-new",
			pullRequestUrl: "https://github.com/octo/repo/pull/1",
		});
		expect(result.files.map((file) => file.path)).toEqual([
			"packages/app/src/index.js",
			"packages/app/README.md",
		]);
		expect(dbModule._c.values).toHaveBeenCalledWith(
			expect.objectContaining({
				status: "success",
				commitSha: "commit-new",
				pullRequestUrl: "https://github.com/octo/repo/pull/1",
			}),
		);
	});

	it("publishes the workspace contents at the repository root when no destination is provided", async () => {
		vi.mocked(storage.getCodeWorkspaceFilesForPublish).mockResolvedValueOnce({
			metadata: { id: ids.projectId, rootFile: "generated-site/index.html" },
			files: [
				{
					path: "generated-site/index.html",
					bytes: new TextEncoder().encode("<h1>Hello</h1>"),
					size: 14,
				},
				{
					path: "generated-site/assets/app.js",
					bytes: new TextEncoder().encode("console.log('ok')"),
					size: 17,
				},
			],
		} as never);
		dbModule._c.limit
			.mockResolvedValueOnce([repoRow])
			.mockResolvedValueOnce([connectionRow]);
		dbModule._c.returning.mockResolvedValueOnce([{ id: "event-root" }]);
		vi.mocked(globalThis.fetch)
			.mockResolvedValueOnce(
				jsonResponse({ token: "installation-token" }) as never,
			)
			.mockResolvedValueOnce(
				jsonResponse({ object: { sha: "base", type: "commit" } }) as never,
			)
			.mockResolvedValueOnce(
				jsonResponse({ tree: { sha: "tree-base" } }) as never,
			)
			.mockResolvedValueOnce(jsonResponse({ sha: "blob-1" }) as never)
			.mockResolvedValueOnce(jsonResponse({ sha: "blob-2" }) as never)
			.mockResolvedValueOnce(jsonResponse({ sha: "tree-new" }) as never)
			.mockResolvedValueOnce(jsonResponse({ sha: "commit-new" }) as never)
			.mockResolvedValueOnce(jsonResponse({}) as never);

		const result = await publishing.publishCodeWorkspaceToGitHub({
			workspaceId: ids.workspaceId,
			userId: ids.userId,
			projectId: ids.projectId,
			repositoryId: ids.repositoryId,
			mode: "direct_push",
			targetBranch: "main",
			commitMessage: "Update files from Maiah",
			confirmDirectPush: true,
		});

		expect(result.files.map((file) => file.path)).toEqual([
			"index.html",
			"assets/app.js",
		]);
		const treeRequest = vi
			.mocked(globalThis.fetch)
			.mock.calls.find(([url]) => String(url).endsWith("/git/trees"));
		expect(
			JSON.parse(String(treeRequest?.[1]?.body)).tree.map(
				(file: { path: string }) => file.path,
			),
		).toEqual(["index.html", "assets/app.js"]);
	});

	it("handles direct-push validation, safety checks, empty repositories, and failure audit rows", async () => {
		await expect(
			publishing.publishCodeWorkspaceToGitHub({
				workspaceId: ids.workspaceId,
				userId: ids.userId,
				projectId: ids.projectId,
				repositoryId: ids.repositoryId,
				mode: "direct_push",
				targetBranch: "main",
				commitMessage: "Push",
			}),
		).rejects.toThrow("Direct push requires explicit user confirmation");

		resetDb();
		dbModule._c.limit
			.mockResolvedValueOnce([{ ...repoRow, permissionsJson: { pull: true } }])
			.mockResolvedValueOnce([connectionRow]);
		await expect(
			publishing.publishCodeWorkspaceToGitHub({
				workspaceId: ids.workspaceId,
				userId: ids.userId,
				projectId: ids.projectId,
				repositoryId: ids.repositoryId,
				mode: "direct_push",
				targetBranch: "main",
				commitMessage: "Push",
				confirmDirectPush: true,
			}),
		).rejects.toThrow("repository write access");

		resetDb();
		vi.mocked(storage.getCodeWorkspaceFilesForPublish).mockResolvedValueOnce({
			metadata: { id: ids.projectId },
			files: [
				{ path: ".env", bytes: new TextEncoder().encode("SECRET=1"), size: 8 },
			],
		} as never);
		dbModule._c.limit
			.mockResolvedValueOnce([repoRow])
			.mockResolvedValueOnce([connectionRow]);
		await expect(
			publishing.publishCodeWorkspaceToGitHub({
				workspaceId: ids.workspaceId,
				userId: ids.userId,
				projectId: ids.projectId,
				repositoryId: ids.repositoryId,
				mode: "direct_push",
				targetBranch: "main",
				commitMessage: "Push",
				confirmDirectPush: true,
			}),
		).rejects.toThrow("Publishing this path is blocked");

		resetDb();
		dbModule._c.limit
			.mockResolvedValueOnce([repoRow])
			.mockResolvedValueOnce([connectionRow]);
		dbModule._c.returning.mockResolvedValueOnce([{ id: "event-empty" }]);
		vi.mocked(globalThis.fetch)
			.mockResolvedValueOnce(
				jsonResponse({ token: "installation-token" }) as never,
			)
			.mockResolvedValueOnce(
				jsonResponse(
					{ message: "Git Repository is empty" },
					{ ok: false, status: 409, statusText: "Conflict" },
				) as never,
			)
			.mockResolvedValueOnce(
				jsonResponse({ commit: { sha: "commit-a" } }) as never,
			)
			.mockResolvedValueOnce(
				jsonResponse({ commit: { sha: "commit-b" } }) as never,
			);
		await expect(
			publishing.publishCodeWorkspaceToGitHub({
				workspaceId: ids.workspaceId,
				userId: ids.userId,
				projectId: ids.projectId,
				repositoryId: ids.repositoryId,
				mode: "direct_push",
				targetBranch: "main",
				commitMessage: "Push",
				confirmDirectPush: true,
			}),
		).resolves.toMatchObject({
			mode: "direct_push",
			commitSha: "commit-b",
			sourceBranch: null,
		});

		resetDb();
		dbModule._c.limit
			.mockResolvedValueOnce([repoRow])
			.mockResolvedValueOnce([connectionRow]);
		vi.mocked(globalThis.fetch)
			.mockResolvedValueOnce(
				jsonResponse({ token: "installation-token" }) as never,
			)
			.mockResolvedValueOnce(
				jsonResponse({ object: { sha: "base", type: "commit" } }) as never,
			)
			.mockResolvedValueOnce(
				jsonResponse({ tree: { sha: "tree-base" } }) as never,
			)
			.mockResolvedValueOnce(
				jsonResponse(
					{ message: "boom" },
					{ ok: false, status: 500, statusText: "Boom" },
				) as never,
			);
		await expect(
			publishing.publishCodeWorkspaceToGitHub({
				workspaceId: ids.workspaceId,
				userId: ids.userId,
				projectId: ids.projectId,
				repositoryId: ids.repositoryId,
				mode: "direct_push",
				targetBranch: "main",
				commitMessage: "Push",
				confirmDirectPush: true,
			}),
		).rejects.toThrow("GitHub API error (500): boom");
		expect(dbModule._c.values).toHaveBeenCalledWith(
			expect.objectContaining({ status: "failed" }),
		);
	});
});
