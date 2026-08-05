import { afterEach,describe,expect,it,vi } from "vitest";

import {
openaiCompatibleAdapter
} from "@/server/infrastructure/providers/openai-compatible-adapter";

function apiErrorResponse() {
  return new Response(
    JSON.stringify({
      error: {
        message: "Stop after capturing the request",
        type: "invalid_request_error",
      },
    }),
    {
      status: 400,
      headers: { "Content-Type": "application/json" },
    },
  );
}

describe("openaiCompatibleAdapter.createImageModel", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the standard OpenAI-compatible image generation endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(apiErrorResponse());
    vi.stubGlobal("fetch", fetchMock);
    const model = openaiCompatibleAdapter.createImageModel?.(
      {
        kind: "openai-compatible",
        name: "Cloud Temple",
        baseUrl: "https://api.ai.cloud-temple.com/v1",
        authType: "bearer",
        apiKey: "secret-key",
      },
      "z-image:16b",
    );

    expect(model).toBeDefined();
    await expect(
      model!.doGenerate({
        prompt: "A mountain lake",
        n: 1,
        size: "1024x1024",
        providerOptions: {},
      } as never),
    ).rejects.toThrow();

    const [input, init] = fetchMock.mock.calls[0] as [
      RequestInfo | URL,
      RequestInit,
    ];
    expect(String(input)).toBe(
      "https://api.ai.cloud-temple.com/v1/images/generations",
    );
    expect(new Headers(init.headers).get("authorization")).toBe(
      "Bearer secret-key",
    );
    expect(JSON.parse(String(init.body))).toMatchObject({
      model: "z-image:16b",
      prompt: "A mountain lake",
      size: "1024x1024",
    });
  });
});
