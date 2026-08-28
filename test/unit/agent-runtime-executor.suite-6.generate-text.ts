import { expect, type Mock } from "vitest";

type DelegationGenerateTextInput = {
  generateText: Mock;
  attachment: {
    id: string;
    fileName: string;
  };
  childAgent: {
    id: string;
    name: string;
  };
};

export function installDelegationGenerateTextMock(input: DelegationGenerateTextInput) {
  const { generateText, attachment, childAgent } = input;
  let call = 0;
  generateText.mockImplementation(async (options) => {
    call += 1;
    if (call === 1) {
      const delegationEntry = Object.entries(options.tools).find(([name]) =>
        name.startsWith("delegate_"),
      );
      expect(delegationEntry?.[0]).toBe("delegate_specialist_1");
      const delegate = delegationEntry?.[1] as {
        description: string;
        execute: (input: {
          task: string;
          attachmentIds?: string[];
        }) => Promise<unknown>;
        toModelOutput: (options: {
          toolCallId: string;
          input: { task: string; attachmentIds?: string[] };
          output: unknown;
        }) => unknown;
      };
      expect(delegate.description).not.toContain(childAgent.id);
      const delegatedOutput = await delegate.execute({
        task: "Investigate",
        attachmentIds: [attachment.id],
      });
      expect(delegatedOutput).toMatchObject({
        childRunId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        childAgentId: childAgent.id,
        childAgentName: childAgent.name,
        result: "Child result",
        visualOutputs: [
          expect.objectContaining({
            kind: "code_sandbox_result",
            title: "Sandbox output",
          }),
        ],
      });
      const visualOutputId = (
        delegatedOutput as { visualOutputs: Array<{ id: string }> }
      ).visualOutputs[0].id;
      const publish = options.tools.publish_specialist_output as {
        execute: (input: { visualOutputId: string }) => Promise<unknown>;
      };
      await expect(
        publish.execute({ visualOutputId }),
      ).resolves.toMatchObject({ kind: "code_sandbox_result", ok: true });
      const modelOutput = await delegate.toModelOutput({
        toolCallId: "delegate-call",
        input: { task: "Investigate", attachmentIds: [attachment.id] },
        output: delegatedOutput,
      });
      expect(modelOutput).toMatchObject({ type: "text" });
      expect((modelOutput as { value: string }).value).toContain(
        "Visual outputs available for optional publication",
      );
      expect(JSON.stringify(modelOutput)).not.toContain(childAgent.id);
      expect(JSON.stringify(modelOutput)).not.toContain(childAgent.name);
      expect(JSON.stringify(modelOutput)).not.toContain(
        "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      );
      return {
        text: "Synthesized",
        usage: { inputTokens: 7, outputTokens: 8 },
      };
    }
    if (call === 2) {
      expect(options.instructions).toContain(
        "Return only the final answer needed by the parent orchestrator.",
      );
      expect(options.instructions).toContain(attachment.id);
      expect(options.instructions).toContain(attachment.fileName);
      const prepareStep = options.prepareStep as (input: {
        stepNumber: number;
      }) => unknown;
      expect(await prepareStep({ stepNumber: 2 })).toBeUndefined();
      expect(await prepareStep({ stepNumber: 3 })).toMatchObject({
        activeTools: [],
        toolChoice: "none",
      });
      const childToolCall = {
        type: "tool-call" as const,
        toolCallId: "child-tool-call",
        toolName: "run_code_sandbox",
        input: {
          language: "python",
          code: "print('done')",
          attachments: [{ id: attachment.id }],
        },
        dynamic: false,
      };
      await options.onToolExecutionStart?.({
        callId: "child-model-call",
        messages: [],
        toolCall: childToolCall,
        toolContext: undefined,
      });
      await options.onToolExecutionEnd?.({
        callId: "child-model-call",
        messages: [],
        toolCall: childToolCall,
        toolContext: undefined,
        toolExecutionMs: 31,
        toolOutput: {
          ...childToolCall,
          type: "tool-result",
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
        },
      });
      return {
        text: "",
        usage: { inputTokens: 2, outputTokens: 3 },
        toolResults: [
          {
            type: "tool-result",
            toolCallId: "child-tool-call",
            toolName: "run_code_sandbox",
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
          },
        ],
        responseMessages: [
          {
            role: "tool",
            content: [
              {
                type: "tool-result",
                toolCallId: "child-tool-call",
                toolName: "run_code_sandbox",
                output: {
                  type: "json",
                  value: { kind: "code_sandbox_result" },
                },
              },
            ],
          },
        ],
      };
    }
    expect(options).not.toHaveProperty("tools");
    expect(options).not.toHaveProperty("prompt");
    expect(options.messages[0].content).toContain(
      '"kind":"code_sandbox_result"',
    );
    expect(options.instructions).toContain(
      "Your previous turn ended without a final text response",
    );
    return {
      text: "Child result",
      usage: { inputTokens: 4, outputTokens: 4 },
    };
  });
}