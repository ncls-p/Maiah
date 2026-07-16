import { afterEach, describe, expect, it, vi } from "vitest";

import { openaiCompatibleAdapter } from "@/server/infrastructure/providers/openai-compatible-adapter";

const generationCall = {
	prompt: [
		{
			role: "user",
			content: [{ type: "text", text: "Hello" }],
		},
	],
} as never;

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

describe("openaiCompatibleAdapter.createChatModel", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("uses the Responses API by default", async () => {
		const fetchMock = vi.fn().mockResolvedValue(apiErrorResponse());
		vi.stubGlobal("fetch", fetchMock);
		const model = openaiCompatibleAdapter.createChatModel(
			{
				kind: "openai-compatible",
				name: "Responses provider",
				baseUrl: "http://localhost:8081/v1",
				authType: "bearer",
				apiKey: "sk-test",
				queryParams: { tenant: "deodis" },
			},
			"test-model",
		);

		await expect(model.doGenerate(generationCall)).rejects.toThrow();

		const [input, init] = fetchMock.mock.calls[0] as [
			RequestInfo | URL,
			RequestInit,
		];
		expect(String(input)).toBe(
			"http://localhost:8081/v1/responses?tenant=deodis",
		);
		expect(new Headers(init.headers).get("authorization")).toBe(
			"Bearer sk-test",
		);
		const requestBody = JSON.parse(String(init.body)) as Record<
			string,
			unknown
		>;
		expect(requestBody).toMatchObject({ model: "test-model" });
		expect(requestBody).toHaveProperty("input");
		expect(requestBody).not.toHaveProperty("messages");
	});

	it("uses Chat Completions when explicitly selected", async () => {
		const fetchMock = vi.fn().mockResolvedValue(apiErrorResponse());
		vi.stubGlobal("fetch", fetchMock);
		const model = openaiCompatibleAdapter.createChatModel(
			{
				kind: "openai-compatible",
				name: "Legacy provider",
				baseUrl: "http://localhost:8081/v1",
				authType: "custom-header",
				headers: { "X-Team": "ai-platform" },
				queryParams: { tenant: "deodis" },
				openaiCompatibleApiRoute: "chat-completions",
			},
			"test-model",
		);

		await expect(model.doGenerate(generationCall)).rejects.toThrow();

		const [input, init] = fetchMock.mock.calls[0] as [
			RequestInfo | URL,
			RequestInit,
		];
		expect(String(input)).toBe(
			"http://localhost:8081/v1/chat/completions?tenant=deodis",
		);
		const requestBody = JSON.parse(String(init.body)) as Record<
			string,
			unknown
		>;
		expect(requestBody).toMatchObject({ model: "test-model" });
		expect(requestBody).toHaveProperty("messages");
		expect(requestBody).not.toHaveProperty("input");
	});

	it("does not leak the Responses API placeholder bearer token", async () => {
		const fetchMock = vi.fn().mockResolvedValue(apiErrorResponse());
		vi.stubGlobal("fetch", fetchMock);
		const model = openaiCompatibleAdapter.createChatModel(
			{
				kind: "openai-compatible",
				name: "Header provider",
				baseUrl: "http://localhost:8081/v1",
				authType: "x-api-key",
				apiKey: "secret-key",
			},
			"test-model",
		);

		await expect(model.doGenerate(generationCall)).rejects.toThrow();

		const [, init] = fetchMock.mock.calls[0] as [
			RequestInfo | URL,
			RequestInit,
		];
		const headers = new Headers(init.headers);
		expect(headers.get("authorization")).toBeNull();
		expect(headers.get("x-api-key")).toBe("secret-key");
	});

	it("preserves an explicit custom Authorization header", async () => {
		const fetchMock = vi.fn().mockResolvedValue(apiErrorResponse());
		vi.stubGlobal("fetch", fetchMock);
		const model = openaiCompatibleAdapter.createChatModel(
			{
				kind: "openai-compatible",
				name: "Custom auth provider",
				baseUrl: "http://localhost:8081/v1",
				authType: "custom-header",
				headers: { Authorization: "Token custom-secret" },
			},
			"test-model",
		);

		await expect(model.doGenerate(generationCall)).rejects.toThrow();

		const [, init] = fetchMock.mock.calls[0] as [
			RequestInfo | URL,
			RequestInit,
		];
		expect(new Headers(init.headers).get("authorization")).toBe(
			"Token custom-secret",
		);
	});
});
