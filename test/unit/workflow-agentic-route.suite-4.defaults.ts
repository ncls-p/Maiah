import type { Mock } from "vitest";

import { createStarterDefinition } from "@/modules/workflows/contracts";

import { createWorkflowAgenticModelFixture } from "./workflow-agentic-route.suite-4.fixture";

export interface WorkflowSuite4Ids {
  workspaceId: string;
  workflowId: string;
  agentId: string;
  versionId: string;
}

export function applyWorkflowSuite4Defaults(
  mocks: Record<string, Mock>,
  ids: WorkflowSuite4Ids,
) {
  mocks.requirePermission.mockResolvedValue(null);
  mocks.getWorkflowDetail.mockResolvedValue({
    id: ids.workflowId,
    workspaceId: ids.workspaceId,
    name: "Summary",
    description: null,
    latestVersion: 1,
    version: 1,
    definition: createStarterDefinition(),
  });
  mocks.listAgents.mockResolvedValue([
    { id: ids.agentId, name: "Workflow assistant" },
  ]);
  mocks.getAgentById.mockResolvedValue(null);
  mocks.getConfiguredWorkflowBuilderAgentId.mockResolvedValue(null);
  mocks.getWorkflowAgentHistory.mockResolvedValue({
    messages: [],
    pendingRequests: [],
  });
  mocks.getPendingWorkflowAgentRunRequests.mockResolvedValue([]);
  mocks.getWorkflowAgentTodoList.mockResolvedValue(null);
  mocks.updateWorkflowAgentTodoList.mockImplementation(async (input) => ({
    kind: "chat_todo_list",
    title: input.todoList.title,
    items: input.todoList.items,
    completedCount: input.todoList.items.filter(
      (item: { status: string }) => item.status === "completed",
    ).length,
    totalCount: input.todoList.items.length,
  }));
  mocks.createWorkflowAgentRunRequest.mockImplementation(async (input) => ({
    id: "99999999-9999-4999-8999-999999999999",
    title: input.title,
    reason: input.reason ?? null,
    inputPreview: input.payload ?? {},
    expectedVersion: input.expectedVersion,
    status: "pending",
    expiresAt: "2099-07-23T10:00:00.000Z",
  }));
  mocks.executeCodeSandbox.mockResolvedValue({
    ok: true,
    stdout: "tests passed",
    stderr: "",
    exitCode: 0,
  });
  mocks.appendWorkflowAgentMessage.mockImplementation(async (input) => ({
    id: crypto.randomUUID(),
    role: input.role,
    content: input.content,
    createdAt: new Date().toISOString(),
  }));
  mocks.searchWebWithSearxng.mockResolvedValue({
    ok: true,
    query: "Build a summary workflow",
    results: [],
  });
  mocks.getAgentDefaultPreferences.mockResolvedValue({
    organizationDefaultAgentId: ids.agentId,
    userDefaultAgentId: null,
    effectiveDefaultAgentId: ids.agentId,
  });
  mocks.getActiveVersion.mockResolvedValue({
    id: ids.versionId,
    maxOutputTokens: 4_000,
    temperature: null,
    topP: null,
  });
  mocks.resolveProviderForVersion.mockResolvedValue({
    providerKind: "openai-compatible",
    providerId: "provider-1",
    modelId: "model-1",
    runtimeConfig: {},
  });
  mocks.createChatModel.mockReturnValue(createWorkflowAgenticModelFixture());
  mocks.updateWorkflow.mockImplementation(async (input) => ({
    ...input,
    latestVersion: 2,
    version: 2,
    status: "draft",
  }));
}
