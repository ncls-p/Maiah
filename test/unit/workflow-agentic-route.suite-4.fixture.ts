import { createStarterDefinition } from "@/modules/workflows/contracts";
import { MockLanguageModelV4, simulateReadableStream } from "ai/test";
import { modelUsage } from "./workflow-agentic-route.suite-3.fixture";

export function toolCallStream(
  toolCallId: string,
  toolName: string,
  input: unknown,
) {
  return {
    stream: simulateReadableStream({
      chunks: [
        { type: "stream-start" as const, warnings: [] },
        {
          type: "tool-call" as const,
          toolCallId,
          toolName,
          input: JSON.stringify(input),
        },
        {
          type: "finish" as const,
          usage: modelUsage,
          finishReason: {
            unified: "tool-calls" as const,
            raw: "tool_calls",
          },
        },
      ],
    }),
  };
}

export function textStream(text: string) {
  return {
    stream: simulateReadableStream({
      chunks: [
        { type: "stream-start" as const, warnings: [] },
        { type: "text-start" as const, id: "text-recovery" },
        {
          type: "text-delta" as const,
          id: "text-recovery",
          delta: text,
        },
        { type: "text-end" as const, id: "text-recovery" },
        {
          type: "finish" as const,
          usage: modelUsage,
          finishReason: { unified: "stop" as const, raw: "stop" },
        },
      ],
    }),
  };
}

export const generatedDefinition = {
  schemaVersion: 1 as const,
  nodes: [
    ...createStarterDefinition().nodes,
    {
      id: "summary",
      type: "data.template" as const,
      label: "Prepare summary",
      position: { x: 360, y: 180 },
      parameters: {
        template: "Summary: {{message}}",
        outputPath: "summary",
      },
      settings: {
        timeoutMs: 30_000,
        maxRetries: 0,
        retryDelayMs: 1_000,
      },
    },
  ],
  edges: [
    {
      id: "edge-trigger-summary",
      source: "trigger",
      target: "summary",
      sourceHandle: null,
    },
  ],
};

export function createWorkflowAgenticModelFixture() {
  return new MockLanguageModelV4({
    modelId: "model-1",
    doStream: [
      {
        stream: simulateReadableStream({
          chunks: [
            { type: "stream-start", warnings: [] },
            {
              type: "tool-call",
              toolCallId: "tool-plan",
              toolName: "set_workflow_plan",
              input: JSON.stringify({
                summary: "Build and verify a summary workflow",
                steps: ["Build the graph", "Validate the connections"],
                tests: ["Exercise the summary template"],
              }),
            },
            {
              type: "finish",
              usage: modelUsage,
              finishReason: {
                unified: "tool-calls",
                raw: "tool_calls",
              },
            },
          ],
        }),
      },
      {
        stream: simulateReadableStream({
          chunks: [
            { type: "stream-start", warnings: [] },
            {
              type: "tool-call",
              toolCallId: "tool-todos",
              toolName: "update_todo_list",
              input: JSON.stringify({
                title: "Summary workflow",
                items: [
                  {
                    id: "build",
                    label: "Build the workflow",
                    status: "in_progress",
                  },
                  {
                    id: "test",
                    label: "Test the workflow",
                    status: "pending",
                  },
                ],
              }),
            },
            {
              type: "finish",
              usage: modelUsage,
              finishReason: {
                unified: "tool-calls",
                raw: "tool_calls",
              },
            },
          ],
        }),
      },
      {
        stream: simulateReadableStream({
          chunks: [
            { type: "stream-start", warnings: [] },
            {
              type: "tool-call",
              toolCallId: "tool-1",
              toolName: "replace_workflow",
              input: JSON.stringify({
                summary: "Added a summary step",
                definition: generatedDefinition,
              }),
            },
            {
              type: "finish",
              usage: modelUsage,
              finishReason: {
                unified: "tool-calls",
                raw: "tool_calls",
              },
            },
          ],
        }),
      },
      {
        stream: simulateReadableStream({
          chunks: [
            { type: "stream-start", warnings: [] },
            {
              type: "tool-call",
              toolCallId: "tool-validate",
              toolName: "validate_workflow",
              input: "{}",
            },
            {
              type: "finish",
              usage: modelUsage,
              finishReason: {
                unified: "tool-calls",
                raw: "tool_calls",
              },
            },
          ],
        }),
      },
      {
        stream: simulateReadableStream({
          chunks: [
            { type: "stream-start", warnings: [] },
            {
              type: "tool-call",
              toolCallId: "tool-sandbox",
              toolName: "run_code_sandbox",
              input: JSON.stringify({
                language: "node",
                code: "console.log('tests passed')",
              }),
            },
            {
              type: "finish",
              usage: modelUsage,
              finishReason: {
                unified: "tool-calls",
                raw: "tool_calls",
              },
            },
          ],
        }),
      },
      {
        stream: simulateReadableStream({
          chunks: [
            { type: "stream-start", warnings: [] },
            {
              type: "tool-call",
              toolCallId: "tool-dry-run",
              toolName: "dry_run_workflow",
              input: JSON.stringify({
                testInput: { message: "A long message" },
              }),
            },
            {
              type: "finish",
              usage: modelUsage,
              finishReason: {
                unified: "tool-calls",
                raw: "tool_calls",
              },
            },
          ],
        }),
      },
      {
        stream: simulateReadableStream({
          chunks: [
            { type: "stream-start", warnings: [] },
            { type: "text-start", id: "text-1" },
            {
              type: "text-delta",
              id: "text-1",
              delta: "The workflow is ready.",
            },
            { type: "text-end", id: "text-1" },
            {
              type: "finish",
              usage: modelUsage,
              finishReason: { unified: "stop", raw: "stop" },
            },
          ],
        }),
      },
    ],
  });
}
