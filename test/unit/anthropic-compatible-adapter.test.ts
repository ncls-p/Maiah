import { afterEach, describe, expect, it, vi } from "vitest";

import { anthropicCompatibleAdapter } from "@/server/infrastructure/providers/anthropic-compatible-adapter";
import { getAdapter } from "@/server/infrastructure/providers";

const generationCall = {
  prompt: [
    {
      role: "user",
      content: [{ type: "text", text: "Hello" }],
    },
  ],
} as never;

describe("anthropicCompatibleAdapter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("registers the Anthropic-compatible provider kind", () => {
    expect(getAdapter("anthropic-compatible")).toBe(
      anthropicCompatibleAdapter,
    );
  });

  it("uses the native Anthropic Messages protocol", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        id: "msg_1",
        type: "message",
        role: "assistant",
        model: "claude-compatible",
        content: [{ type: "text", text: "Hello" }],
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const model = anthropicCompatibleAdapter.createChatModel(
      {
        kind: "anthropic-compatible",
        name: "Anthropic proxy",
        baseUrl: "https://anthropic.example/v1/",
        authType: "x-api-key",
        apiKey: "secret",
      },
      "claude-compatible",
    );

    await expect(model.doGenerate(generationCall)).resolves.toMatchObject({
      content: [{ type: "text", text: "Hello" }],
    });

    const [input, init] = fetchMock.mock.calls[0] as [
      RequestInfo | URL,
      RequestInit,
    ];
    expect(String(input)).toBe("https://anthropic.example/v1/messages");
    const headers = new Headers(init.headers);
    expect(headers.get("x-api-key")).toBe("secret");
    expect(headers.get("anthropic-version")).toBe("2023-06-01");
    expect(JSON.parse(String(init.body))).toMatchObject({
      model: "claude-compatible",
      messages: [{ role: "user" }],
    });
  });

  it("discovers models through the Anthropic Models API", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        data: [
          {
            id: "claude-compatible",
            type: "model",
            display_name: "Claude Compatible",
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      anthropicCompatibleAdapter.listModels?.({
        kind: "anthropic-compatible",
        name: "Anthropic",
        baseUrl: "https://api.anthropic.com",
        authType: "x-api-key",
        apiKey: "secret",
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        modelId: "claude-compatible",
        displayName: "Claude Compatible",
        capabilities: expect.objectContaining({
          text: true,
          tools: true,
          embeddings: false,
        }),
      }),
    ]);

    const [input, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(String(input)).toBe("https://api.anthropic.com/v1/models");
    expect(new Headers(init.headers).get("x-api-key")).toBe("secret");
  });

  it("supports bearer-authenticated Anthropic-compatible gateways", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ data: [] }));
    vi.stubGlobal("fetch", fetchMock);

    await anthropicCompatibleAdapter.listModels?.({
      kind: "anthropic-compatible",
      name: "Gateway",
      baseUrl: "https://gateway.example/anthropic/v1",
      authType: "bearer",
      apiKey: "token",
      queryParams: { tenant: "demo" },
    });

    const [input, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(String(input)).toBe(
      "https://gateway.example/anthropic/v1/models?tenant=demo",
    );
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer token");
  });
});
