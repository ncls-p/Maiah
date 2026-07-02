import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	createCodeWorkspaceFromFiles: vi.fn(),
	listCodeWorkspaceFiles: vi.fn(),
	readCodeWorkspaceFile: vi.fn(),
	writeCodeWorkspaceFile: vi.fn(),
	deleteCodeWorkspaceFile: vi.fn(),
	getUserGitHubStatus: vi.fn(),
	publishCodeWorkspaceToGitHub: vi.fn(),
	searchWebWithSearxng: vi.fn(),
	executeCodeSandbox: vi.fn(),
	createBusinessArtifact: vi.fn(),
	createSlideDeckArtifact: vi.fn(),
}));

vi.mock("@/modules/code-workspace/storage", () => ({
	codeWorkspaceCreateInputSchema: { parse: vi.fn((value) => value) },
	codeWorkspaceProjectInputSchema: { parse: vi.fn((value) => value) },
	codeWorkspaceReadFileInputSchema: { parse: vi.fn((value) => value) },
	codeWorkspaceReplaceTextInputSchema: { parse: vi.fn((value) => value) },
	codeWorkspaceWriteFileInputSchema: { parse: vi.fn((value) => value) },
	createCodeWorkspaceFromFiles: mocks.createCodeWorkspaceFromFiles,
	deleteCodeWorkspaceFile: mocks.deleteCodeWorkspaceFile,
	listCodeWorkspaceFiles: mocks.listCodeWorkspaceFiles,
	readCodeWorkspaceFile: mocks.readCodeWorkspaceFile,
	writeCodeWorkspaceFile: mocks.writeCodeWorkspaceFile,
}));

vi.mock("@/modules/github/publishing", () => ({
	githubPublishCodeWorkspaceInputSchema: { parse: vi.fn((value) => value) },
	githubPublishStatusInputSchema: { parse: vi.fn((value) => value) },
	getUserGitHubStatus: mocks.getUserGitHubStatus,
	publishCodeWorkspaceToGitHub: mocks.publishCodeWorkspaceToGitHub,
}));

vi.mock("@/modules/tool/search-web", () => ({
	searchWebWithSearxng: mocks.searchWebWithSearxng,
	webSearchInputSchema: { parse: vi.fn((value) => value) },
}));

vi.mock("@/modules/tool/code-sandbox", () => ({
	codeSandboxInputSchema: { parse: vi.fn((value) => value) },
	executeCodeSandbox: mocks.executeCodeSandbox,
}));

vi.mock("@/modules/tool/business-artifact-tools", () => {
	const schema = { parse: vi.fn((value) => value) };
	const create = vi.fn(() => ({ kind: "business_artifact" }));
	return {
		actionPlanInputSchema: schema,
		businessDocumentInputSchema: schema,
		competitiveBattlecardInputSchema: schema,
		customerAccountPlanInputSchema: schema,
		decisionMatrixInputSchema: schema,
		emailPackInputSchema: schema,
		meetingBriefInputSchema: schema,
		projectStatusReportInputSchema: schema,
		raciMatrixInputSchema: schema,
		riskRegisterInputSchema: schema,
		spreadsheetInputSchema: schema,
		createActionPlanArtifact: create,
		createBusinessDocumentArtifact: create,
		createCompetitiveBattlecardArtifact: create,
		createCustomerAccountPlanArtifact: create,
		createDecisionMatrixArtifact: create,
		createEmailPackArtifact: create,
		createMeetingBriefArtifact: create,
		createProjectStatusReportArtifact: create,
		createRaciMatrixArtifact: create,
		createRiskRegisterArtifact: create,
		createSpreadsheetArtifact: create,
	};
});

vi.mock("@/modules/tool/slide-deck-tool", () => ({
	slideDeckInputSchema: { parse: vi.fn((value) => value) },
	createSlideDeckArtifact: mocks.createSlideDeckArtifact,
}));

import { builtInTools } from "@/modules/tool/builtin-tools";

const mockFn = (fn: unknown) => fn as Mock;

function tool(name: string) {
	const found = builtInTools.find((item) => item.name === name);
	if (!found) throw new Error(`missing ${name}`);
	return found;
}

function runTool(name: string, input: unknown, context?: unknown) {
	return (tool(name).execute as (input: unknown, context?: unknown) => unknown)(
		input,
		context,
	);
}

const context = {
	workspaceId: "ws-1",
	userId: "user-1",
	conversationId: "conv-1",
};

beforeEach(() => {
	vi.clearAllMocks();
	mockFn(mocks.createCodeWorkspaceFromFiles).mockResolvedValue({
		ok: "created",
	});
	mockFn(mocks.listCodeWorkspaceFiles).mockResolvedValue({ files: [] });
	mockFn(mocks.readCodeWorkspaceFile).mockResolvedValue({
		path: "index.html",
		content: "one two one",
	});
	mockFn(mocks.writeCodeWorkspaceFile).mockResolvedValue({ ok: "written" });
	mockFn(mocks.deleteCodeWorkspaceFile).mockResolvedValue({ ok: "deleted" });
	mockFn(mocks.getUserGitHubStatus).mockResolvedValue({ connected: true });
	mockFn(mocks.publishCodeWorkspaceToGitHub).mockResolvedValue({ ok: true });
	mockFn(mocks.searchWebWithSearxng).mockResolvedValue({
		ok: true,
		results: [],
	});
	mockFn(mocks.executeCodeSandbox).mockResolvedValue({
		kind: "code_sandbox_result",
		ok: true,
	});
	mockFn(mocks.createBusinessArtifact).mockReturnValue({
		kind: "business_artifact",
	});
	mockFn(mocks.createSlideDeckArtifact).mockReturnValue({
		kind: "slide_deck_artifact",
	});
});

describe("builtInTools", () => {
	it("executes low-risk primitive and web/artifact tools", async () => {
		expect(await runTool("calculator", { expression: "2 + 3 * 4" })).toEqual({
			result: 14,
		});
		expect(await runTool("current_time", { timezone: "UTC" })).toMatchObject({
			timezone: "UTC",
		});

		const originalFetch = globalThis.fetch;
		globalThis.fetch = vi.fn(
			async () =>
				new Response("body", {
					status: 201,
					statusText: "Created",
					headers: { "content-type": "text/plain" },
				}),
		) as typeof fetch;
		await expect(
			runTool("http_fetch", { url: "https://example.test", method: "GET" }),
		).resolves.toMatchObject({ status: 201, bodyPreview: "body" });
		await expect(
			runTool("http_fetch", { url: "https://example.test", method: "HEAD" }),
		).resolves.toMatchObject({ bodyPreview: "" });
		globalThis.fetch = originalFetch;

		await expect(
			runTool("web_search", { query: "news" }),
		).resolves.toMatchObject({ query: "news", results: [] });
		expect(
			runTool("render_html_artifact", {
				title: "Demo",
				html: "<h1/>",
				css: "",
				js: "",
				height: 300,
			}),
		).toMatchObject({ kind: "html_artifact", title: "Demo" });
		await expect(
			runTool("run_code_sandbox", { language: "node", code: "1" }, context),
		).resolves.toMatchObject({ kind: "code_sandbox_result" });
	});

	it("delegates code workspace tools and enforces workspace context", async () => {
		await expect(
			runTool(
				"code_workspace_create_project",
				{ title: "App", rootFile: "index.html", files: [] },
				context,
			),
		).resolves.toEqual({ ok: "created" });
		await expect(
			runTool("code_workspace_list_files", { projectId: "p1" }, context),
		).resolves.toEqual({ files: [] });
		await expect(
			runTool(
				"code_workspace_read_file",
				{ projectId: "p1", path: "index.html" },
				context,
			),
		).resolves.toMatchObject({ content: "one two one" });
		await expect(
			runTool(
				"code_workspace_write_file",
				{ projectId: "p1", path: "index.html", content: "next" },
				context,
			),
		).resolves.toEqual({ ok: "written" });
		await expect(
			runTool(
				"code_workspace_delete_file",
				{ projectId: "p1", path: "old.html" },
				context,
			),
		).resolves.toEqual({ ok: "deleted" });
		await expect(
			runTool("code_workspace_list_files", { projectId: "p1" }, undefined),
		).rejects.toThrow("Code workspace tools require chat workspace context");
		expect(mocks.createCodeWorkspaceFromFiles).toHaveBeenCalledWith(
			expect.objectContaining({ workspaceId: "ws-1", userId: "user-1" }),
		);
	});

	it("replaces code workspace text safely and delegates GitHub publishing", async () => {
		await expect(
			runTool(
				"code_workspace_replace_text",
				{ projectId: "p1", path: "index.html", oldText: "two", newText: "2" },
				context,
			),
		).resolves.toEqual({ ok: "written" });
		expect(mocks.writeCodeWorkspaceFile).toHaveBeenLastCalledWith(
			expect.objectContaining({ content: "one 2 one" }),
		);
		await expect(
			runTool(
				"code_workspace_replace_text",
				{
					projectId: "p1",
					path: "index.html",
					oldText: "one",
					newText: "1",
					replaceAll: true,
				},
				context,
			),
		).resolves.toEqual({ ok: "written" });
		expect(mocks.writeCodeWorkspaceFile).toHaveBeenLastCalledWith(
			expect.objectContaining({ content: "1 two 1" }),
		);
		await expect(
			runTool(
				"code_workspace_replace_text",
				{
					projectId: "p1",
					path: "index.html",
					oldText: "missing",
					newText: "x",
				},
				context,
			),
		).rejects.toThrow("oldText was not found");
		await expect(
			runTool(
				"code_workspace_replace_text",
				{ projectId: "p1", path: "index.html", oldText: "one", newText: "x" },
				context,
			),
		).rejects.toThrow("appears multiple times");

		await expect(
			runTool("github_get_publish_status", {}, context),
		).resolves.toEqual({ connected: true });
		await expect(
			runTool(
				"github_publish_code_workspace",
				{
					projectId: "p1",
					repositoryId: "r1",
					mode: "pull_request",
					targetBranch: "main",
				},
				context,
			),
		).resolves.toEqual({ ok: true });
		expect(mocks.publishCodeWorkspaceToGitHub).toHaveBeenCalledWith(
			expect.objectContaining({
				workspaceId: "ws-1",
				userId: "user-1",
				conversationId: "conv-1",
			}),
		);
	});
});
