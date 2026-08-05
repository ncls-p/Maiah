import { createStarterDefinition,type WorkflowDefinition } from "@/modules/workflows/contracts";
import type { LanguageModelV4Usage } from "@ai-sdk/provider";
import { MockLanguageModelV4,simulateReadableStream } from "ai/test";
import { NextRequest } from "next/server";

const workspaceId = "22222222-2222-4222-8222-222222222222";
const workflowId = "33333333-3333-4333-8333-333333333333";

export const modelUsage: LanguageModelV4Usage = {
  inputTokens: {
    total: 10,
    noCache: 10,
    cacheRead: 0,
    cacheWrite: 0,
  },
  outputTokens: {
    total: 5,
    text: 5,
    reasoning: 0,
  },
};

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

const incompleteDefinition = {
  schemaVersion: 1 as const,
  nodes: [
    ...createStarterDefinition().nodes,
    {
      id: "assistant",
      type: "agent.run" as const,
      label: "",
      position: { x: 360, y: 180 },
      parameters: { agentId: "", prompt: "" },
      settings: {
        timeoutMs: 30_000,
        maxRetries: 0,
        retryDelayMs: 1_000,
      },
    },
  ],
  edges: [
    {
      id: "edge-trigger-assistant",
      source: "trigger",
      target: "assistant",
      sourceHandle: null,
    },
  ],
};

export function request(definition: WorkflowDefinition = incompleteDefinition) {
  return new NextRequest(`http://localhost/api/workspace/workflows/${workflowId}/agentic`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      workspaceId,
      message: "Build a summary workflow",
      draft: {
        name: "Summary workflow",
        description: null,
        definition,
      },
    }),
  });
}
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
