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
