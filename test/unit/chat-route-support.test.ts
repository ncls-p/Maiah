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

const organizationToolPolicyMock = vi.hoisted(() => ({
  getOrganizationBuiltInToolPolicyMap: vi.fn(),
}));

const knowledgeUseCasesMock = vi.hoisted(() => ({
  getKnowledgeBindingsForVersion: vi.fn(),
  readBoundKnowledgeChunkWindow: vi.fn(),
  searchBoundKnowledgeBases: vi.fn(),
}));

vi.mock("@/modules/tool/use-cases", () => toolUseCasesMock);

vi.mock("@/server/infrastructure/db", () => ({
  db: {},
}));

vi.mock("@/server/infrastructure/ai-sdk/devtools", () => ({
  registerAiSdkDevTools: vi.fn(),
}));

vi.mock("@/modules/tool/invocation-state", () => invocationStateMock);

vi.mock(
  "@/modules/tool/organization-builtin-tool-policies",
  () => organizationToolPolicyMock,
);

vi.mock("@/modules/knowledge/use-cases", () => knowledgeUseCasesMock);

vi.mock("@/modules/tool/opa-approval-policy", () => ({
  evaluateOpaToolApprovalPolicy: vi.fn(async () => null),
}));

type BuildBoundTools =
  (typeof import("@/app/api/workspace/[agentId]/chat/route-support"))["buildBoundTools"];

type BuiltInToolLookup =
  (typeof import("@/modules/tool/builtin-tools"))["getBuiltInToolByName"];

async function loadModules() {
  vi.resetModules();
  const [routeSupport, builtinTools] = await Promise.all([
    import("@/app/api/workspace/[agentId]/chat/route-support"),
    import("@/modules/tool/builtin-tools"),
  ]);
  return {
    buildBoundTools: routeSupport.buildBoundTools as BuildBoundTools,
    projectStreamedToolInput: routeSupport.projectStreamedToolInput,
    streamToolErrorOutput: routeSupport.streamToolErrorOutput,
    mergeUserFilePartMetadata: routeSupport.mergeUserFilePartMetadata,
    knowledgeCitationsFromToolOutput:
      routeSupport.knowledgeCitationsFromToolOutput,
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
    organizationToolPolicyMock.getOrganizationBuiltInToolPolicyMap.mockResolvedValue(
      new Map(),
    );
    knowledgeUseCasesMock.getKnowledgeBindingsForVersion.mockResolvedValue([]);
    knowledgeUseCasesMock.searchBoundKnowledgeBases.mockResolvedValue([]);
    knowledgeUseCasesMock.readBoundKnowledgeChunkWindow.mockResolvedValue(null);
  });

  it("does not auto-enable code workspace tools without explicit bindings", async () => {
    const { buildBoundTools } = await loadModules();

    const { tools } = await buildBoundTools(buildInput());

    expect(Object.keys(tools)).not.toContain("code_workspace_create_project");
    expect(Object.keys(tools)).not.toContain("code_workspace_write_file");
  });

  it("always exposes a live to-do list tool for multi-step chats", async () => {
    const { buildBoundTools } = await loadModules();
    const { tools } = await buildBoundTools(buildInput());

    expect(Object.keys(tools)).toContain("update_todo_list");
    await expect(
      (tools.update_todo_list.execute as (input: unknown) => Promise<unknown>)({
        title: "Investigation",
        items: [
          { id: "research", label: "Research", status: "completed" },
          { id: "test", label: "Test", status: "in_progress" },
        ],
      }),
    ).resolves.toMatchObject({
      kind: "chat_todo_list",
      completedCount: 1,
      totalCount: 2,
    });
  });

  it("exposes on-demand search and neighboring chunk tools for connected data sources", async () => {
    const chunkId = "10000000-0000-4000-8000-000000000001";
    const documentId = "10000000-0000-4000-8000-000000000002";
    const knowledgeBaseId = "10000000-0000-4000-8000-000000000003";
    knowledgeUseCasesMock.getKnowledgeBindingsForVersion.mockResolvedValue([
      {
        id: "binding-1",
        knowledgeBaseId,
        name: "Policies",
        description: "Human resources policies",
      },
    ]);
    knowledgeUseCasesMock.searchBoundKnowledgeBases.mockResolvedValue([
      {
        chunkId,
        documentId,
        documentTitle: "Leave policy",
        content: "Employees receive 25 days of leave.",
        score: 0.91,
        knowledgeBaseId,
        knowledgeBaseName: "Policies",
      },
    ]);
    knowledgeUseCasesMock.readBoundKnowledgeChunkWindow.mockResolvedValue({
      anchorChunkId: chunkId,
      documentId,
      documentTitle: "Leave policy",
      knowledgeBaseId,
      knowledgeBaseName: "Policies",
      chunks: [
        {
          chunkId,
          chunkIndex: 3,
          content: "Employees receive 25 days of leave.",
          isAnchor: true,
        },
      ],
      truncated: false,
    });
    const { buildBoundTools, knowledgeCitationsFromToolOutput } =
      await loadModules();

    const { tools } = await buildBoundTools(buildInput());

    expect(Object.keys(tools)).toEqual(
      expect.arrayContaining(["search_knowledge", "read_knowledge_context"]),
    );
    const searchOutput = await (
      tools.search_knowledge.execute as (input: unknown) => Promise<unknown>
    )({ query: "annual leave", knowledgeBaseIds: [knowledgeBaseId], limit: 3 });
    expect(knowledgeCitationsFromToolOutput(searchOutput)).toHaveLength(1);
    expect(
      knowledgeUseCasesMock.searchBoundKnowledgeBases,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        agentVersionId: "version-1",
        knowledgeBaseIds: [knowledgeBaseId],
        query: "annual leave",
        limit: 3,
      }),
    );

    await (
      tools.read_knowledge_context.execute as (
        input: unknown,
      ) => Promise<unknown>
    )({ chunkId, before: 1, after: 2 });
    expect(
      knowledgeUseCasesMock.readBoundKnowledgeChunkWindow,
    ).toHaveBeenCalledWith({
      agentVersionId: "version-1",
      workspaceId: "workspace-1",
      userId: "user-1",
      chunkId,
      before: 1,
      after: 2,
    });
  });

  it("lets the model explicitly select several connected data sources", async () => {
    const firstId = "10000000-0000-4000-8000-000000000011";
    const secondId = "10000000-0000-4000-8000-000000000012";
    knowledgeUseCasesMock.getKnowledgeBindingsForVersion.mockResolvedValue([
      {
        id: "binding-1",
        knowledgeBaseId: firstId,
        name: "Policies",
        description: "Human resources policies",
      },
      {
        id: "binding-2",
        knowledgeBaseId: secondId,
        name: "Engineering",
        description: "Architecture and operations",
      },
    ]);
    const { buildBoundTools } = await loadModules();
    const { tools } = await buildBoundTools(buildInput());

    await (
      tools.search_knowledge.execute as (input: unknown) => Promise<unknown>
    )({
      query: "policy architecture",
      knowledgeBaseIds: [firstId, secondId],
    });

    expect(
      knowledgeUseCasesMock.searchBoundKnowledgeBases,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ knowledgeBaseIds: [firstId, secondId] }),
    );
  });

  it("does not expose knowledge tools when the agent has no data source binding", async () => {
    const { buildBoundTools } = await loadModules();

    const { tools } = await buildBoundTools(buildInput());

    expect(Object.keys(tools)).not.toContain("search_knowledge");
    expect(Object.keys(tools)).not.toContain("read_knowledge_context");
  });

  it("auto-enables the governed sandbox for readable document exploration", async () => {
    const { buildBoundTools } = await loadModules();

    const { tools } = await buildBoundTools({
      ...buildInput(),
      enableDocumentExplorer: true,
    });

    expect(Object.keys(tools)).toContain("run_code_sandbox");
  });

  it("does not auto-enable the document sandbox when the organization disabled it", async () => {
    organizationToolPolicyMock.getOrganizationBuiltInToolPolicyMap.mockResolvedValue(
      new Map([
        ["run_code_sandbox", { enabled: false, requireApproval: true }],
      ]),
    );
    const { buildBoundTools } = await loadModules();

    const { tools } = await buildBoundTools({
      ...buildInput(),
      enableDocumentExplorer: true,
    });

    expect(Object.keys(tools)).not.toContain("run_code_sandbox");
  });

  it("keeps persisted attachments when a user message is regenerated", async () => {
    const { mergeUserFilePartMetadata } = await loadModules();
    const persistedFile = {
      kind: "chat_file",
      id: "file-1",
      fileName: "brief.pdf",
    };
    const refreshedFile = { ...persistedFile, extractionStatus: "readable" };
    const persistedImage = {
      kind: "chat_image",
      id: "image-1",
      fileName: "logo.png",
    };

    expect(
      mergeUserFilePartMetadata(
        [persistedFile, persistedImage],
        [refreshedFile],
      ),
    ).toEqual([refreshedFile, persistedImage]);
  });

  it("projects partial tool input while redacting secrets", async () => {
    const { projectStreamedToolInput } = await loadModules();

    await expect(
      projectStreamedToolInput(
        '{"query":"streaming tools","apiKey":"super-secret',
      ),
    ).resolves.toBe(
      JSON.stringify(
        { query: "streaming tools", apiKey: "[REDACTED]" },
        null,
        2,
      ),
    );
  });

  it("normalizes hallucinated tool calls into terminal error outputs", async () => {
    const { streamToolErrorOutput } = await loadModules();

    expect(
      streamToolErrorOutput(
        {
          type: "tool-error",
          toolName: "google_web_search",
          error: "Tool google_web_search is not available",
        },
        { name: "AI_NoSuchToolError" },
      ),
    ).toEqual({
      ok: false,
      code: "tool_unavailable",
      error: "The requested tool is not available for this assistant.",
    });
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

  it("removes a tool disabled for the current conversation", async () => {
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

    const { tools } = await buildBoundTools({
      ...buildInput(),
      disabledToolKeys: new Set([`builtin:${createProjectTool?.id}`]),
    });

    expect(Object.keys(tools)).not.toContain("code_workspace_create_project");
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
    toolUseCasesMock.logToolInvocation.mockResolvedValue({
      id: "invocation-1",
    });
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
