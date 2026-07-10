import { beforeEach, describe, expect, it, vi } from "vitest";

const toolUseCasesMock = vi.hoisted(() => ({
	canExecuteRestrictedTool: vi.fn(),
	getCustomBindingContext: vi.fn(),
	getMcpBindingContext: vi.fn(),
	getToolBindingsForVersion: vi.fn(),
	logToolInvocation: vi.fn(),
}));

const invocationStateMock = vi.hoisted(() => ({
	waitForApproval: vi.fn(),
}));

vi.mock("@/modules/tool/use-cases", () => toolUseCasesMock);

vi.mock("@/server/infrastructure/db", () => ({
	db: {},
}));

vi.mock("@/server/infrastructure/ai-sdk/devtools", () => ({
	registerAiSdkDevTools: vi.fn(),
}));

vi.mock("@/modules/tool/invocation-state", () => invocationStateMock);

vi.mock("@/modules/tool/opa-approval-policy", () => ({
	evaluateOpaToolApprovalPolicy: vi.fn(async () => null),
}));

type BuildBoundTools =
	typeof import("@/app/api/workspace/[agentId]/chat/route-support")["buildBoundTools"];

type BuiltInToolLookup =
	typeof import("@/modules/tool/builtin-tools")["getBuiltInToolByName"];

async function loadModules() {
	vi.resetModules();
	const [routeSupport, builtinTools] = await Promise.all([
		import("@/app/api/workspace/[agentId]/chat/route-support"),
		import("@/modules/tool/builtin-tools"),
	]);
	return {
		buildBoundTools: routeSupport.buildBoundTools as BuildBoundTools,
		getBuiltInToolByName:
			builtinTools.getBuiltInToolByName as BuiltInToolLookup,
		waitForApproval: invocationStateMock.waitForApproval,
	};
}

function buildInput() {
	return {
		agentVersionId: "version-1",
		workspaceId: "workspace-1",
		conversationId: "conversation-1",
		messageId: "message-1",
		userId: "user-1",
		maxToolCalls: 6,
		hasSkills: false,
	};
}

describe("chat route tool gating", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		toolUseCasesMock.getToolBindingsForVersion.mockResolvedValue([]);
	});

	it("does not auto-enable code workspace tools without explicit bindings", async () => {
		const { buildBoundTools } = await loadModules();

		const { tools } = await buildBoundTools(buildInput());

		expect(Object.keys(tools)).not.toContain("code_workspace_create_project");
		expect(Object.keys(tools)).not.toContain("code_workspace_write_file");
	});

	it("exposes a code workspace tool only when the builtin tool is bound", async () => {
		const { buildBoundTools, getBuiltInToolByName } = await loadModules();
		const createProjectTool = getBuiltInToolByName(
			"code_workspace_create_project",
		);
		expect(createProjectTool).toBeTruthy();
		toolUseCasesMock.getToolBindingsForVersion.mockResolvedValue([
			{
				id: "binding-1",
				agentVersionId: "version-1",
				toolSource: "builtin",
				toolId: createProjectTool?.id,
				requireApproval: false,
				riskLevel: createProjectTool?.riskLevel,
				createdAt: new Date(),
			},
		]);

		const { tools } = await buildBoundTools(buildInput());

		expect(Object.keys(tools)).toContain("code_workspace_create_project");
		expect(Object.keys(tools)).not.toContain("code_workspace_write_file");
	});

	it("aliases long custom tool keys to OpenAI-compatible names", async () => {
		const { buildBoundTools } = await loadModules();
		const longToolName =
			"tool_name_that_is_long_enough_to_break_openai_function_name_limits";
		toolUseCasesMock.getToolBindingsForVersion.mockResolvedValue([
			{
				id: "binding-1",
				agentVersionId: "version-1",
				toolSource: "custom",
				toolId: "12345678-1234-4234-9234-123456789abc",
				requireApproval: false,
				riskLevel: "low",
				createdAt: new Date(),
			},
		]);
		toolUseCasesMock.getCustomBindingContext.mockResolvedValue({
			tool: {
				id: "12345678-1234-4234-9234-123456789abc",
				name: longToolName,
				description: "Long custom tool",
				inputSchemaJson: { type: "object", properties: {} },
			},
		});

		const { tools, toolApproval } = await buildBoundTools({
			...buildInput(),
			approvalPolicy: { denyToolNames: [longToolName] },
		});
		const [toolKey] = Object.keys(tools);

		expect(toolKey).toMatch(/^custom_[a-z0-9]+_/);
		expect(toolKey.length).toBeLessThanOrEqual(64);
		expect(toolKey).not.toContain("12345678_1234_4234_9234_123456789abc");
		await expect(
			toolApproval?.({
				toolCall: { toolName: toolKey, input: {} },
			} as never),
		).resolves.toMatchObject({ type: "denied" });
	});

	it("emits a bounded redacted payload for human approval", async () => {
		const { buildBoundTools, waitForApproval } = await loadModules();
		const onApprovalRequired = vi.fn();
		toolUseCasesMock.getToolBindingsForVersion.mockResolvedValue([
			{
				id: "binding-1",
				agentVersionId: "version-1",
				toolSource: "custom",
				toolId: "12345678-1234-4234-9234-123456789abc",
				requireApproval: true,
				riskLevel: "high",
				createdAt: new Date(),
			},
		]);
		toolUseCasesMock.getCustomBindingContext.mockResolvedValue({
			tool: {
				id: "12345678-1234-4234-9234-123456789abc",
				name: "post_webhook",
				description: "Post a webhook",
				inputSchemaJson: { type: "object", properties: {} },
			},
		});
		toolUseCasesMock.logToolInvocation.mockResolvedValue({ id: "invocation-1" });
		waitForApproval.mockResolvedValue({
			status: "rejected",
			error: "Rejected by user",
		});

		const { tools } = await buildBoundTools({
			...buildInput(),
			onApprovalRequired,
		});
		const [tool] = Object.values(tools);
		await (tool.execute as (input: unknown) => Promise<unknown>)({
			apiKey: "hidden",
			maxOutputTokens: 512,
		});

		expect(onApprovalRequired).toHaveBeenCalledWith({
			invocationId: "invocation-1",
			toolName: "post_webhook",
			input: {
				apiKey: "[REDACTED]",
				maxOutputTokens: 512,
			},
		});
	});
});
