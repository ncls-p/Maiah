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
    chatRequestSchema: routeSupport.chatRequestSchema,
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

  it("accepts temporary-chat creation only as an explicit boolean", async () => {
    const { chatRequestSchema } = await loadModules();
    expect(
      chatRequestSchema.parse({
        content: "Hello",
        ephemeral: true,
        ephemeralTtlMinutes: 5,
      }),
    ).toMatchObject({
      content: "Hello",
      ephemeral: true,
      ephemeralTtlMinutes: 5,
    });
    expect(
      chatRequestSchema.safeParse({ content: "Hello", ephemeral: "yes" })
        .success,
    ).toBe(false);
    expect(
      chatRequestSchema.safeParse({
        content: "Hello",
        ephemeral: true,
        ephemeralTtlMinutes: 30,
      }).success,
    ).toBe(false);
  });

  it("accepts code workspace mode only as an explicit boolean", async () => {
    const { chatRequestSchema } = await loadModules();
    expect(
      chatRequestSchema.parse({
        content: "Build the app",
        codeWorkspaceMode: true,
      }),
    ).toMatchObject({ codeWorkspaceMode: true });
    expect(
      chatRequestSchema.safeParse({
        content: "Build the app",
        codeWorkspaceMode: "yes",
      }).success,
    ).toBe(false);
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
    )({
      query: "annual leave",
      knowledgeBaseIds: [knowledgeBaseId],
      limit: 3,
    });
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

  it("auto-enables the unified workspace tools for document exploration", async () => {
    const { buildBoundTools } = await loadModules();

    const { tools } = await buildBoundTools({
      ...buildInput(),
      enableDocumentExplorer: true,
    });

    expect(Object.keys(tools)).toEqual(
      expect.arrayContaining(["read", "edit", "write", "bash"]),
    );
    expect(Object.keys(tools)).not.toContain("run_code_sandbox");
  });
});
