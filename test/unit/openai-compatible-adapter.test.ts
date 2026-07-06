import { afterEach, describe, expect, it, vi } from "vitest";

import { openaiCompatibleAdapter } from "@/server/infrastructure/providers/openai-compatible-adapter";

describe("openaiCompatibleAdapter.listModels", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("includes vLLM-served chat models from OpenAI-compatible /models", async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			Response.json({
				data: [
					{
						id: "nvidia/Qwen3.6-27B-NVFP4",
						object: "model",
						owned_by: "vllm",
						backend: "vllm",
					},
					{
						id: "RedHatAI/gemma-4-31B-it-NVFP4",
						object: "model",
						owned_by: "vllm",
						backend: "vllm",
					},
				],
			}),
		);
		vi.stubGlobal("fetch", fetchMock);

		const models = await openaiCompatibleAdapter.listModels?.({
			kind: "openai-compatible",
			name: "Cortex",
			baseUrl: "http://localhost:8081/v1",
			authType: "custom-header",
		});

		expect(fetchMock).toHaveBeenCalledWith(
			"http://localhost:8081/v1/models",
			expect.any(Object),
		);
		expect(models?.map((model) => model.modelId)).toEqual([
			"nvidia/Qwen3.6-27B-NVFP4",
			"RedHatAI/gemma-4-31B-it-NVFP4",
		]);
	});

	it("keeps every model with an id, including embedding models", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(
				Response.json({
					data: [
						{ id: "chat-model", backend: "vllm" },
						{ id: "embedding-model", backend: "vllm", task: "embedding" },
						{ object: "model", backend: "vllm" },
					],
				}),
			),
		);

		const models = await openaiCompatibleAdapter.listModels?.({
			kind: "openai-compatible",
			name: "Cortex",
			baseUrl: "http://localhost:8081/v1",
			authType: "custom-header",
		});

		expect(models?.map((model) => model.modelId)).toEqual([
			"chat-model",
			"embedding-model",
		]);
	});
});
