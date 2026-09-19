import type {
  JSONSchema7,
  LanguageModelV4CallOptions,
  LanguageModelV4StreamPart,
} from "@ai-sdk/provider";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getAdapter,
  type ProviderRuntimeConfig,
} from "@/server/infrastructure/providers";
import {
  providerReply,
  toolInput,
  type Protocol,
} from "./provider-schema-fixtures";

const base = {
  name: "test",
  authType: "bearer" as const,
  apiKey: "test-key",
  baseUrl: "https://provider.test/v1",
};
const cases: {
  name: string;
  config: ProviderRuntimeConfig;
  protocol: Protocol;
  modelId?: string;
}[] = [
  {
    name: "OpenAI Responses",
    config: {
      ...base,
      kind: "openai-compatible",
      openaiCompatibleApiRoute: "responses",
    },
    protocol: "responses",
  },
  {
    name: "native fallback",
    config: { ...base, kind: "native" },
    protocol: "responses",
  },
  {
    name: "OpenAI Chat Completions",
    config: {
      ...base,
      kind: "openai-compatible",
      openaiCompatibleApiRoute: "chat-completions",
    },
    protocol: "chat",
  },
  {
    name: "Anthropic",
    config: { ...base, kind: "anthropic-compatible", authType: "x-api-key" },
    protocol: "anthropic",
  },
  {
    name: "Vercel Gateway",
    config: { ...base, kind: "vercel-ai-gateway" },
    protocol: "chat",
  },
  {
    name: "Dragonfly OpenAI",
    config: { ...base, kind: "dragonfly" },
    protocol: "chat",
  },
  {
    name: "Dragonfly Anthropic",
    config: { ...base, kind: "dragonfly" },
    protocol: "chat",
    modelId: "claude-test",
  },
  ...(["api-key", "iam"] as const).map((authMode) => ({
    name: `Bedrock ${authMode}`,
    config: {
      ...base,
      kind: "amazon-bedrock" as const,
      bedrock: {
        region: "eu-west-1",
        authMode,
        accessKeyId: "test-access",
        secretAccessKey: "test-secret",
      },
    },
    protocol: "bedrock" as const,
  })),
];
const schema: JSONSchema7 = {
  type: "object",
  additionalProperties: false,
  properties: {
    options: {
      type: "object",
      propertyNames: { enum: ["color", "storage"] },
      additionalProperties: { type: "string" },
    },
    nested: {
      type: "array",
      items: {
        anyOf: [
          { type: "object", propertyNames: { pattern: "^x" } },
          { type: "object", propertyNames: { $ref: "#/$defs/key" } },
        ],
      },
    },
    open: { type: "object", propertyNames: true },
    empty: { type: "object", propertyNames: false },
  },
  $defs: { key: { const: "color" } },
  required: ["options"],
};
afterEach(() => vi.unstubAllGlobals());

describe.each(cases)(
  "$name tool schema contract",
  ({ config, protocol, modelId }) => {
    it.each([false, true])(
      "accepts schema preparation and decodes tool calls (stream=%s)",
      async (streaming) => {
        const fetchMock = vi
          .fn()
          .mockImplementation(async () => providerReply(protocol, streaming));
        vi.stubGlobal("fetch", fetchMock);
        const params: LanguageModelV4CallOptions = {
          prompt: [
            { role: "user", content: [{ type: "text", text: "configure" }] },
          ],
          tools: ["mcp_catalog", "builtin_action", "custom_action"].map(
            (name) => ({
              type: "function",
              name,
              description: "Configure options",
              inputSchema: schema,
            }),
          ),
        };
        const before = structuredClone(params);
        const model = getAdapter(config.kind).createChatModel(
          config,
          modelId ?? "test-model",
        );
        if (streaming) {
          const result = await model.doStream(params);
          const chunks: LanguageModelV4StreamPart[] = [];
          const reader = result.stream.getReader();
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
          }
          expect(chunks.filter((chunk) => chunk.type === "error")).toEqual([]);
          expect(chunks).toContainEqual(
            expect.objectContaining({
              type: "tool-call",
              toolName: "mcp_catalog",
              input: JSON.stringify(toolInput),
            }),
          );
        } else {
          const result = await model.doGenerate(params);
          expect(result.content).toContainEqual(
            expect.objectContaining({
              type: "tool-call",
              toolName: "mcp_catalog",
              input: JSON.stringify(toolInput),
            }),
          );
          if (protocol === "responses")
            expect(result.warnings).toContainEqual(
              expect.objectContaining({
                type: "compatibility",
                feature: "JSON Schema propertyNames",
              }),
            );
        }
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const wire = JSON.parse(String(fetchMock.mock.calls[0][1].body));
        const schemas =
          protocol === "bedrock"
            ? wire.toolConfig.tools.map(
                (tool: { toolSpec: { inputSchema: { json: unknown } } }) =>
                  tool.toolSpec.inputSchema.json,
              )
            : wire.tools.map(
                (tool: {
                  parameters?: unknown;
                  input_schema?: unknown;
                  function?: { parameters: unknown };
                }) =>
                  tool.parameters ??
                  tool.input_schema ??
                  tool.function?.parameters,
              );
        expect(schemas).toHaveLength(3);
        for (const sent of schemas) {
          if (protocol === "responses") {
            expect(sent.properties.options).not.toHaveProperty("propertyNames");
            expect(sent.required).toEqual(["options"]);
            expect(sent.additionalProperties).toBe(false);
          } else expect(sent).toEqual(schema);
        }
        expect(params).toEqual(before);
      },
    );
  },
);
