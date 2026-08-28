import { mocks } from "./agent-runtime-executor.suite-6.mocks";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { executeAgent } from "@/modules/agent/runtime-executor";

import {
  childAgent,
  childVersion,
  orchestrator,
  orchestratorVersion,
  rootAgent,
} from "./agent-runtime-executor.suite-6.fixture";
import { applyAgentSuite6Defaults } from "./agent-runtime-executor.suite-6.defaults";

beforeEach(() => {
  vi.clearAllMocks();
  applyAgentSuite6Defaults(mocks);
});

describe("agent runtime executor", () => {
  it("fails closed when an orchestrator delegates an attachment outside its authorized set", async () => {
    mocks.getVisibleAgent.mockResolvedValueOnce(orchestrator);
    mocks.getActiveVersion.mockResolvedValueOnce(orchestratorVersion);
    mocks.getDelegationBindings.mockResolvedValueOnce([
      {
        childAgentId: childAgent.id,
        childAgentVersionId: childVersion.id,
        instructions: "Research",
      },
    ]);
    mocks.generateText.mockImplementationOnce(async (options) => {
      const delegate = Object.entries(options.tools).find(([name]) =>
        name.startsWith("delegate_"),
      )?.[1] as {
        execute: (input: {
          task: string;
          attachmentIds: string[];
        }) => Promise<unknown>;
      };
      await expect(
        delegate.execute({
          task: "Inspect a file",
          attachmentIds: ["34343434-3434-4434-8434-343434343434"],
        }),
      ).rejects.toMatchObject({
        code: "AGENT_DELEGATION_ATTACHMENT_FORBIDDEN",
      });
      return {
        text: "The requested file was not delegated.",
        usage: { inputTokens: 3, outputTokens: 4 },
      };
    });

    await expect(
      executeAgent({
        workspaceId: rootAgent.workspaceId,
        userId: rootAgent.createdById,
        agentId: rootAgent.id,
        prompt: "Coordinate",
        trigger: "api",
        availableAttachments: [],
      }),
    ).resolves.toMatchObject({ text: "The requested file was not delegated." });

    expect(mocks.getVersion).not.toHaveBeenCalled();
    expect(mocks.appendStep).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "delegation", status: "failed" }),
    );
  });
});