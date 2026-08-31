import { mocks } from "./agent-runtime-executor.suite-6.mocks";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { executeAgent } from "@/modules/agent/runtime-executor";

import {
  childAgent,
  childVersion,
  orchestrator,
  orchestratorVersion,
  provider,
  rootAgent,
} from "./agent-runtime-executor.suite-6.fixture";
import { applyAgentSuite6Defaults } from "./agent-runtime-executor.suite-6.defaults";
import { installDelegationGenerateTextMock } from "./agent-runtime-executor.suite-6.generate-text";
beforeEach(() => {
  vi.clearAllMocks();
  applyAgentSuite6Defaults(mocks);
});

describe("agent runtime executor", () => {
  it("rechecks delegation permission and executes the pinned child version", async () => {
    const onProgress = vi.fn();
    const attachment = {
      kind: "chat_file" as const,
      id: "12121212-1212-4212-8212-121212121212",
      fileName: "quarterly-report.pdf",
      mimeType: "application/pdf",
      size: 4_096,
      hash: "attachment-hash",
      url: "/api/workspace/chat-attachments/quarterly-report",
      category: "document" as const,
      extractionStatus: "readable" as const,
      extractedTextChars: 12_000,
    };
    mocks.getVisibleAgent
      .mockResolvedValueOnce(orchestrator)
      .mockResolvedValueOnce(childAgent);
    mocks.getActiveVersion.mockResolvedValueOnce(orchestratorVersion);
    mocks.getVersion.mockResolvedValueOnce(childVersion);
    mocks.resolveProvider
      .mockResolvedValueOnce({ ...provider, modelRecordId: "root-model" })
      .mockResolvedValueOnce({ ...provider, modelRecordId: "child-model" });
    mocks.getDelegationBindings.mockResolvedValueOnce([
      {
        childAgentId: childAgent.id,
        childAgentVersionId: childVersion.id,
        instructions: "Research",
      },
    ]);
    mocks.buildBoundTools
      .mockResolvedValueOnce({ tools: {}, toolApproval: undefined })
      .mockResolvedValueOnce({
        tools: {
          web_search: { execute: vi.fn(async () => ({ sourceCount: 3 })) },
        },
        toolApproval: undefined,
      });
    mocks.createRun
      .mockResolvedValueOnce({
        run: { id: "77777777-7777-4777-8777-777777777777", status: "queued" },
        reused: false,
      })
      .mockResolvedValueOnce({
        run: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", status: "queued" },
        reused: false,
      });
    installDelegationGenerateTextMock({
      generateText: mocks.generateText,
      attachment,
      childAgent,
    });

    const result = await executeAgent({
      workspaceId: rootAgent.workspaceId,
      userId: rootAgent.createdById,
      agentId: rootAgent.id,
      prompt: "Coordinate",
      trigger: "api",
      availableAttachments: [attachment],
      onProgress,
    });

    expect(result.totalTreeTokens).toBe(28);
    expect(result.usageBreakdown).toEqual(
      expect.arrayContaining([
        {
          modelId: "child-model",
          inputTokens: 6,
          outputTokens: 7,
        },
        { modelId: "root-model", inputTokens: 7, outputTokens: 8 },
      ]),
    );
    expect(mocks.checkPermission).toHaveBeenCalledWith(
      { principalType: "user", principalId: rootAgent.createdById },
      "agents.delegate",
      "agent",
      childAgent.id,
    );
    expect(mocks.getVersion).toHaveBeenCalledWith(childVersion.id);
    expect(mocks.createRun).toHaveBeenLastCalledWith(
      expect.objectContaining({
        agentId: childAgent.id,
        agentVersionId: childVersion.id,
        parentRunId: "77777777-7777-4777-8777-777777777777",
        trigger: "delegation",
      }),
    );
    const rootDeadline = mocks.createRun.mock.calls[0][0].deadlineAt as Date;
    const childDeadline = mocks.createRun.mock.calls[1][0].deadlineAt as Date;
    expect(rootDeadline.getTime() - childDeadline.getTime()).toBe(7_500);
    expect(mocks.completeRun).toHaveBeenLastCalledWith(
      expect.objectContaining({ reservationTokens: 28 }),
    );
    expect(onProgress).toHaveBeenNthCalledWith(1, {
      type: "tool-start",
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa:child-tool-call",
      toolCallId: "child-tool-call",
      toolName: "run_code_sandbox",
      agentName: childAgent.name,
      agentId: childAgent.id,
      runId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      parentRunId: "77777777-7777-4777-8777-777777777777",
      depth: 1,
      modelHistoryKind: "visual-only",
      input: {
        language: "python",
        code: "print('done')",
        attachments: [{ id: attachment.id }],
      },
    });
    expect(onProgress).toHaveBeenNthCalledWith(2, {
      type: "tool-end",
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa:child-tool-call",
      toolCallId: "child-tool-call",
      toolName: "run_code_sandbox",
      agentName: childAgent.name,
      agentId: childAgent.id,
      runId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      parentRunId: "77777777-7777-4777-8777-777777777777",
      depth: 1,
      modelHistoryKind: "visual-only",
      durationMs: 31,
      output: {
        kind: "code_sandbox_result",
        ok: true,
        language: "python",
        exitCode: 0,
        timedOut: false,
        durationMs: 31,
        stdout: "done",
        stderr: "",
        files: [
          {
            path: "chart.png",
            size: 120,
            mimeType: "image/png",
            fromInput: false,
          },
        ],
      },
    });
    expect(mocks.buildBoundTools).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ enableDocumentExplorer: true }),
    );
  });
});