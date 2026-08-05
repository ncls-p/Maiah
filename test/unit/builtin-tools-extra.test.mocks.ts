import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";

import { builtInTools } from "@/modules/tool/builtin-tools";

export const mocks = vi.hoisted(() => ({
	createCodeWorkspaceFromFiles: vi.fn(),
	listCodeWorkspaceFiles: vi.fn(),
	readCodeWorkspaceFile: vi.fn(),
	writeCodeWorkspaceFile: vi.fn(),
	importCodeWorkspaceFile: vi.fn(),
	getChatAttachmentBytes: vi.fn(),
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
	importCodeWorkspaceFile: mocks.importCodeWorkspaceFile,
}));

vi.mock("@/modules/chat/attachments", () => ({
	getChatAttachmentBytes: mocks.getChatAttachmentBytes,
}));

vi.mock("@/modules/github/publishing", () => ({
	githubPublishCodeWorkspaceInputSchema: { parse: vi.fn((value) => value) },
	githubPublishStatusInputSchema: { parse: vi.fn((value) => value) },
	getUserGitHubStatus: mocks.getUserGitHubStatus,
	publishCodeWorkspaceToGitHub: mocks.publishCodeWorkspaceToGitHub,
}));

vi.mock("@/modules/tool/builtin-tool-primitives", async (importOriginal) => {
	const actual =
		await importOriginal<
			typeof import("@/modules/tool/builtin-tool-primitives")
		>();
	return {
		...actual,
		searchWebWithSearxng: mocks.searchWebWithSearxng,
		webSearchInputSchema: { parse: vi.fn((value) => value) },
	};
});

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

const mockFn = (fn: unknown) => fn as Mock;

function tool(name: string) {
	const found = builtInTools.find((item) => item.name === name);
	if (!found) throw new Error(`missing ${name}`);
	return found;
}

export function runTool(name: string, input: unknown, context?: unknown) {
	return (tool(name).execute as (input: unknown, context?: unknown) => unknown)(
		input,
		context,
	);
}

export const context = {
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
	mockFn(mocks.importCodeWorkspaceFile).mockResolvedValue({ ok: "imported" });
	mockFn(mocks.getChatAttachmentBytes).mockResolvedValue({
		metadata: { kind: "chat_image" },
		bytes: new Uint8Array([1, 2, 3]),
	});
	mockFn(mocks.deleteCodeWorkspaceFile).mockResolvedValue({ ok: "deleted" });
	mockFn(mocks.getUserGitHubStatus).mockResolvedValue({ connected: true });
	mockFn(mocks.publishCodeWorkspaceToGitHub).mockResolvedValue({ ok: true });
	mockFn(mocks.searchWebWithSearxng).mockImplementation(
		async (input: { query: string }) => ({
			ok: true,
			query: input.query,
			results: [],
		}),
	);
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
