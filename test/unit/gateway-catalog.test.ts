import { describe, expect, it } from "vitest";
import { parseGatewayCatalog } from "@/server/infrastructure/providers/gateway-catalog";
describe("Gateway catalog enrichment", () => {
  it("converts documented USD per-token prices, imports descriptions and tags, and keeps unknown impact unknown", () => {
    const [model] = parseGatewayCatalog({
      data: [
        {
          id: "test/model",
          name: "Model",
          description: "For analysis",
          tags: ["reasoning", "tool-use"],
          type: "language",
          pricing: { input: "0.000003", output: "0.000015" },
          context_window: 128000,
          modalities: { input: ["text", "image"], output: ["text"] },
        },
      ],
    });
    expect(model).toMatchObject({
      displayName: "Model",
      description: "For analysis",
      tags: ["reasoning", "tool-use"],
      inputTokenCost: "3",
      outputTokenCost: "15",
      contextWindow: 128000,
      capabilities: { vision: true, tools: true, reasoning: true },
      sustainability: { currency: "USD" },
    });
    expect(model.sustainability?.energyKwhPerMillionTokens).toBeUndefined();
  });
  it("does not confuse image prices with token prices", () => {
    expect(
      parseGatewayCatalog({
        data: [
          null,
          {
            id: "test/image",
            type: "image",
            pricing: { input: "0.04" },
            modalities: { output: ["image"] },
          },
        ],
      })[0],
    ).toMatchObject({
      inputTokenCost: undefined,
      capabilities: { imageGeneration: true, text: false },
    });
  });
});

it("uses the native Gateway image protocol with explicit connection credentials", async () => {
  const { vi } = await import("vitest");
  const { vercelAiGatewayAdapter } =
    await import("@/server/infrastructure/providers/vercel-ai-gateway-adapter");
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ images: ["aGVsbG8="], warnings: [] }), {
      headers: { "content-type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  try {
    const result = await vercelAiGatewayAdapter.createImageModel!(
      {
        kind: "vercel-ai-gateway",
        name: "Gateway",
        authType: "gateway",
        apiKey: "tenant-gateway-key",
      },
      "bfl/flux",
    ).doGenerate({
      prompt: "Lake",
      n: 1,
      size: "1024x1024",
      providerOptions: {},
    } as never);
    expect(result.images).toEqual(["aGVsbG8="]);
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      "https://ai-gateway.vercel.sh/v4/ai/image-model",
    );
    expect(
      new Headers(fetchMock.mock.calls[0][1].headers).get("authorization"),
    ).toBe("Bearer tenant-gateway-key");
  } finally {
    vi.unstubAllGlobals();
  }
});
