import { bedrockEvents } from "./bedrock-event-fixture";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  amazonBedrockAdapter,
  bedrockError,
} from "@/server/infrastructure/providers/amazon-bedrock-adapter";
import type { ProviderRuntimeConfig } from "@/server/infrastructure/providers/adapter";
const aws = vi.hoisted(() => ({
  send: vi.fn(),
  destroy: vi.fn(),
  options: vi.fn(),
}));
vi.mock("@aws-sdk/client-bedrock", () => ({
  BedrockClient: class {
    constructor(options: unknown) {
      aws.options(options);
    }
    send = aws.send;
    destroy = aws.destroy;
  },
  ListFoundationModelsCommand: class {
    constructor(public input: unknown) {}
  },
  ListInferenceProfilesCommand: class {
    constructor(public input: unknown) {}
  },
}));
const config: ProviderRuntimeConfig = {
  kind: "amazon-bedrock",
  name: "AWS",
  authType: "bearer",
  apiKey: "tenant-key",
  bedrock: { region: "eu-west-1", authMode: "api-key" },
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
describe("Bedrock native adapter", () => {
  it("loads the regional catalog, paginates profiles, and identifies Nova Canvas", async () => {
    aws.send
      .mockResolvedValueOnce({
        modelSummaries: [
          {
            modelId: "anthropic.claude",
            modelName: "Claude",
            inputModalities: ["TEXT", "IMAGE"],
            outputModalities: ["TEXT"],
            inferenceTypesSupported: ["ON_DEMAND"],
          },
          {
            modelId: "amazon.nova-canvas-v1:0",
            outputModalities: ["IMAGE"],
            inferenceTypesSupported: ["ON_DEMAND"],
          },
          {
            modelId: "old",
            modelLifecycle: { status: "LEGACY" },
            outputModalities: ["TEXT"],
            inferenceTypesSupported: ["ON_DEMAND"],
          },
        ],
      })
      .mockResolvedValueOnce({
        inferenceProfileSummaries: [
          {
            status: "ACTIVE",
            inferenceProfileId: "eu.claude",
            models: [
              {
                modelArn:
                  "arn:aws:bedrock:eu-west-1::foundation-model/anthropic.claude",
              },
            ],
          },
        ],
        nextToken: "next",
      })
      .mockResolvedValueOnce({});
    const models = await amazonBedrockAdapter.listModels!(config);
    expect(models.map((m) => m.modelId)).toEqual([
      "anthropic.claude",
      "amazon.nova-canvas-v1:0",
      "eu.claude",
    ]);
    expect(models[1].capabilities?.imageGeneration).toBe(true);
    expect(models[2].capabilities?.vision).toBe(true);
    expect(
      models.every(
        (m) => m.inputTokenCost === undefined && m.sustainability === undefined,
      ),
    ).toBe(true);
    expect(aws.options).toHaveBeenCalledWith(
      expect.objectContaining({
        region: "eu-west-1",
        token: { token: "tenant-key" },
        authSchemePreference: ["httpBearerAuth"],
      }),
    );
    expect(aws.destroy).toHaveBeenCalledOnce();
  });
  it("sanitizes permission failures and disposes the client", async () => {
    aws.send.mockRejectedValueOnce(
      Object.assign(new Error("secret details"), {
        name: "AccessDeniedException",
      }),
    );
    expect(await amazonBedrockAdapter.validateConnection(config)).toMatchObject(
      { status: "unhealthy", message: "BEDROCK_ACCESS_DENIED" },
    );
    expect(aws.destroy).toHaveBeenCalledOnce();
    expect(bedrockError(new Error("token=private"))).toBe(
      "BEDROCK_CATALOG_UNAVAILABLE",
    );
  });
  it("rejects missing tenant credentials even if host AWS credentials exist", () => {
    vi.stubEnv("AWS_BEARER_TOKEN_BEDROCK", "host-key");
    expect(() =>
      amazonBedrockAdapter.createChatModel({ ...config, apiKey: "" }, "model"),
    ).toThrow("BEDROCK_API_KEY_REQUIRED");
    expect(() =>
      amazonBedrockAdapter.createChatModel(
        { ...config, bedrock: { region: "eu-west-1", authMode: "iam" } },
        "model",
      ),
    ).toThrow("BEDROCK_IAM_CREDENTIALS_REQUIRED");
  });
  it.each(["api-key", "iam"] as const)(
    "uses official Converse with tenant %s authentication and tools",
    async (authMode) => {
      vi.stubEnv("AWS_BEARER_TOKEN_BEDROCK", "wrong-host-key");
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            output: {
              message: { role: "assistant", content: [{ text: "Bonjour" }] },
            },
            stopReason: "end_turn",
            usage: { inputTokens: 4, outputTokens: 2, totalTokens: 6 },
            metrics: { latencyMs: 1 },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
      vi.stubGlobal("fetch", fetchMock);
      const model = amazonBedrockAdapter.createChatModel(
        {
          ...config,
          bedrock: {
            region: "eu-west-1",
            authMode,
            accessKeyId: "tenant-access",
            secretAccessKey: "tenant-secret",
            sessionToken: "tenant-session",
          },
        },
        "anthropic.claude",
      );
      const result = await model.doGenerate({
        prompt: [
          { role: "user", content: [{ type: "text", text: "Bonjour" }] },
        ],
        tools: [
          {
            type: "function",
            name: "weather",
            description: "Weather",
            inputSchema: { type: "object", properties: {} },
          },
        ],
      });
      expect(result.content).toContainEqual({ type: "text", text: "Bonjour" });
      const [url, init] = fetchMock.mock.calls[0];
      expect(String(url)).toContain(
        "bedrock-runtime.eu-west-1.amazonaws.com/model/anthropic.claude/converse",
      );
      const authorization = new Headers(init.headers).get("authorization");
      expect(authorization).toContain(
        authMode === "api-key"
          ? "Bearer tenant-key"
          : "AWS4-HMAC-SHA256 Credential=tenant-access/",
      );
      expect(authorization).not.toContain("wrong-host-key");
      expect(JSON.parse(init.body).toolConfig.tools[0].toolSpec.name).toBe(
        "weather",
      );
    },
  );
  it("generates images through native Nova Canvas", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ images: ["aGVsbG8="] }), {
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const result = await amazonBedrockAdapter.createImageModel!(
      config,
      "amazon.nova-canvas-v1:0",
    ).doGenerate({
      prompt: "Lake",
      n: 1,
      size: "1024x1024",
      providerOptions: {},
    } as never);
    expect(result.images).toEqual(["aGVsbG8="]);
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      "/model/amazon.nova-canvas-v1%3A0/invoke",
    );
  });
});

it("streams native text and tool calls with usage", async () => {
  const bytes = bedrockEvents([
    { contentBlockDelta: { contentBlockIndex: 0, delta: { text: "Bonjour" } } },
    { contentBlockStop: { contentBlockIndex: 0 } },
    {
      contentBlockStart: {
        contentBlockIndex: 1,
        start: { toolUse: { toolUseId: "call-1", name: "weather" } },
      },
    },
    {
      contentBlockDelta: {
        contentBlockIndex: 1,
        delta: { toolUse: { input: '{"city":"Paris"}' } },
      },
    },
    { contentBlockStop: { contentBlockIndex: 1 } },
    { messageStop: { stopReason: "tool_use" } },
    {
      metadata: {
        usage: { inputTokens: 4, outputTokens: 8, totalTokens: 12 },
        metrics: { latencyMs: 1 },
      },
    },
  ]);
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(bytes, {
        headers: { "content-type": "application/vnd.amazon.eventstream" },
      }),
    ),
  );
  const result = await amazonBedrockAdapter
    .createChatModel(config, "anthropic.claude")
    .doStream({
      prompt: [{ role: "user", content: [{ type: "text", text: "Weather?" }] }],
    });
  const chunks = [];
  const reader = result.stream.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  expect(chunks).toContainEqual(
    expect.objectContaining({ type: "text-delta", delta: "Bonjour" }),
  );
  expect(chunks).toContainEqual(
    expect.objectContaining({
      type: "tool-call",
      toolName: "weather",
      input: '{"city":"Paris"}',
    }),
  );
  expect(chunks.some((chunk) => chunk.type === "error")).toBe(false);
  expect(chunks).toContainEqual(
    expect.objectContaining({
      type: "finish",
      finishReason: { unified: "tool-calls", raw: "tool_use" },
    }),
  );
});
