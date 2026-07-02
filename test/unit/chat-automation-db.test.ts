import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/infrastructure/ai-sdk/devtools", () => ({
	registerAiSdkDevTools: vi.fn(),
}));

vi.mock("@/lib/crypto", () => ({
	decryptValue: vi.fn(async (value: string) => `dec:${value}`),
}));

vi.mock("@/lib/logger", () => ({
	logHandledWarning: vi.fn(),
}));

vi.mock("ai", () => ({
	generateText: vi
		.fn()
		.mockResolvedValue({ text: '{"ok":true}', finalStep: { reasoning: [] } }),
}));

vi.mock("@/server/infrastructure/providers", () => ({
	getAdapter: vi.fn().mockReturnValue({
		createChatModel: vi.fn().mockReturnValue({ model: "runtime" }),
	}),
}));

type Chain = {
	select: ReturnType<typeof vi.fn>;
	insert: ReturnType<typeof vi.fn>;
	from: ReturnType<typeof vi.fn>;
	where: ReturnType<typeof vi.fn>;
	orderBy: ReturnType<typeof vi.fn>;
	limit: ReturnType<typeof vi.fn>;
	values: ReturnType<typeof vi.fn>;
	onConflictDoUpdate: ReturnType<typeof vi.fn>;
};

function makeChain(): Chain {
	const c = {} as Chain;
	for (const key of [
		"select",
		"insert",
		"from",
		"where",
		"orderBy",
		"values",
		"onConflictDoUpdate",
	] as const) {
		c[key] = vi.fn().mockReturnThis();
	}
	c.limit = vi.fn().mockResolvedValue([]);
	return c;
}

type DbModule = {
	db: { select: ReturnType<typeof vi.fn>; insert: ReturnType<typeof vi.fn> };
	_c: Chain;
};

vi.mock("@/server/infrastructure/db", () => {
	const chain = makeChain();
	return { db: { select: vi.fn(), insert: vi.fn() }, _c: chain };
});

import { generateText } from "ai";
import { decryptValue } from "@/lib/crypto";
import { logHandledWarning } from "@/lib/logger";
import * as _dbModule from "@/server/infrastructure/db";
import {
	generateChatAutomationArtifacts,
	getChatAutomationAdminState,
	setChatAutomationConfig,
	testChatAutomationConnection,
	validateChatAutomationConfig,
} from "@/modules/chat/automation";

const dbModule = _dbModule as unknown as DbModule;

function resetDb() {
	dbModule.db.select.mockReset().mockReturnValue(dbModule._c);
	dbModule.db.insert.mockReset().mockReturnValue(dbModule._c);
	for (const key of [
		"select",
		"insert",
		"from",
		"where",
		"orderBy",
		"values",
		"onConflictDoUpdate",
	] as const) {
		dbModule._c[key].mockReset().mockReturnThis();
	}
	dbModule._c.limit.mockReset().mockResolvedValue([]);
}

const providerId = "11111111-1111-4111-8111-111111111111";
const modelId = "22222222-2222-4222-8222-222222222222";
const enabledConfig = {
	enabled: true,
	providerId,
	modelId,
	generateTitles: true,
	generateSuggestions: true,
};
const provider = {
	id: providerId,
	kind: "openai",
	name: "OpenAI",
	baseUrl: null,
	authType: "bearer",
	encryptedApiKey: "api-key",
	encryptedHeadersJson: { "x-test": "header" },
	queryParamsJson: { beta: "true" },
};
const model = {
	id: modelId,
	providerId,
	modelId: "gpt-4.1-mini",
	enabled: true,
};

beforeEach(() => {
	vi.clearAllMocks();
	resetDb();
	vi.mocked(decryptValue)
		.mockReset()
		.mockImplementation(async (value: string) => `dec:${value}`);
	vi.mocked(generateText)
		.mockReset()
		.mockResolvedValue({
			text: '{"ok":true}',
			finalStep: { reasoning: [] },
		} as never);
});

describe("chat automation config", () => {
	it("persists config and returns parsed defaults", async () => {
		dbModule._c.limit.mockResolvedValueOnce([
			{ valueJson: { enabled: false } },
		]);

		const result = await setChatAutomationConfig(
			{ enabled: false, generateTitles: true, generateSuggestions: false },
			"user-1",
		);

		expect(dbModule.db.insert).toHaveBeenCalled();
		expect(dbModule._c.onConflictDoUpdate).toHaveBeenCalled();
		expect(result).toEqual({
			enabled: false,
			generateTitles: true,
			generateSuggestions: true,
		});
	});

	it("returns admin config, providers, and models", async () => {
		dbModule._c.limit.mockResolvedValueOnce([{ valueJson: enabledConfig }]);
		dbModule._c.orderBy
			.mockResolvedValueOnce([{ id: providerId, name: "OpenAI" }])
			.mockResolvedValueOnce([{ id: modelId, modelId: "gpt" }]);

		const result = await getChatAutomationAdminState();

		expect(result.config.enabled).toBe(true);
		expect(result.providers).toHaveLength(1);
		expect(result.models).toHaveLength(1);
	});
});

describe("chat automation runtime validation", () => {
	it("rejects missing provider/model and unavailable runtime rows", async () => {
		await expect(
			validateChatAutomationConfig({
				enabled: true,
				generateTitles: true,
				generateSuggestions: true,
			}),
		).resolves.toMatchObject({ ok: false });

		dbModule._c.limit.mockResolvedValueOnce([]);
		await expect(validateChatAutomationConfig(enabledConfig)).resolves.toEqual({
			ok: false,
			issues: [
				{
					code: "runtime_unavailable",
					message:
						"Selected provider was not found, is disabled, or is archived.",
				},
			],
		});

		resetDb();
		dbModule._c.limit
			.mockResolvedValueOnce([provider])
			.mockResolvedValueOnce([]);
		await expect(validateChatAutomationConfig(enabledConfig)).resolves.toEqual({
			ok: false,
			issues: [
				{
					code: "runtime_unavailable",
					message:
						"Selected model was not found, is disabled, or does not belong to the provider.",
				},
			],
		});
	});

	it("tests the configured model and reports empty or thrown responses", async () => {
		dbModule._c.limit
			.mockResolvedValueOnce([{ valueJson: enabledConfig }])
			.mockResolvedValueOnce([provider])
			.mockResolvedValueOnce([model])
			.mockResolvedValueOnce([provider])
			.mockResolvedValueOnce([model]);

		await expect(testChatAutomationConnection()).resolves.toEqual({ ok: true });
		expect(decryptValue).toHaveBeenCalledWith("api-key");
		expect(decryptValue).toHaveBeenCalledWith("header");

		resetDb();
		vi.mocked(generateText).mockResolvedValueOnce({
			text: "",
			finalStep: { reasoning: [] },
		} as never);
		dbModule._c.limit
			.mockResolvedValueOnce([{ valueJson: enabledConfig }])
			.mockResolvedValueOnce([provider])
			.mockResolvedValueOnce([model])
			.mockResolvedValueOnce([provider])
			.mockResolvedValueOnce([model]);
		await expect(testChatAutomationConnection()).resolves.toEqual({
			ok: false,
			error: "Model returned an empty response.",
		});

		resetDb();
		vi.mocked(generateText).mockRejectedValueOnce(new Error("model down"));
		dbModule._c.limit
			.mockResolvedValueOnce([{ valueJson: enabledConfig }])
			.mockResolvedValueOnce([provider])
			.mockResolvedValueOnce([model])
			.mockResolvedValueOnce([provider])
			.mockResolvedValueOnce([model]);
		await expect(testChatAutomationConnection()).resolves.toEqual({
			ok: false,
			error: "model down",
		});
	});
});

describe("generateChatAutomationArtifacts", () => {
	it("uses fallback when automation is disabled or runtime is unavailable", async () => {
		dbModule._c.limit.mockResolvedValueOnce([
			{ valueJson: { enabled: false } },
		]);
		await expect(
			generateChatAutomationArtifacts({
				userMessage: "Bonjour aide moi",
				assistantText: "Bien sûr",
				fallbackTitle: "Fallback",
			}),
		).resolves.toEqual({ title: "Fallback", suggestions: [] });

		resetDb();
		dbModule._c.limit
			.mockResolvedValueOnce([{ valueJson: enabledConfig }])
			.mockResolvedValueOnce([]);
		const result = await generateChatAutomationArtifacts({
			userMessage: "Bonjour aide moi",
			assistantText: "Bien sûr",
			fallbackTitle: "Fallback",
		});
		expect(result.title).toBe("Bonjour aide moi");
		expect(result.suggestions).toHaveLength(3);
		expect(logHandledWarning).toHaveBeenCalledWith(
			"Chat automation runtime unavailable, using local fallback",
			expect.any(Object),
		);
	});

	it("generates artifacts with retries, sanitizes title, and pads suggestions", async () => {
		vi.mocked(generateText)
			.mockResolvedValueOnce({
				text: "",
				finalStep: { reasoning: [] },
			} as never)
			.mockResolvedValueOnce({
				text: '{"title":"Planned roadmap","suggestions":["Next step","Another angle","Third option"]}',
				finalStep: { reasoning: [] },
			} as never);
		dbModule._c.limit
			.mockResolvedValueOnce([{ valueJson: enabledConfig }])
			.mockResolvedValueOnce([provider])
			.mockResolvedValueOnce([model]);

		const result = await generateChatAutomationArtifacts({
			userMessage: "Build a roadmap",
			assistantText: "Here is a plan",
			fallbackTitle: "Fallback",
		});

		expect(result.title).toBe("Planned roadmap");
		expect(result.suggestions).toEqual([
			"Next step",
			"Another angle",
			"Third option",
		]);
	});

	it("falls back when generation throws and honors suggestion opt-out", async () => {
		vi.mocked(generateText).mockRejectedValueOnce(new Error("bad model"));
		dbModule._c.limit
			.mockResolvedValueOnce([{ valueJson: enabledConfig }])
			.mockResolvedValueOnce([provider])
			.mockResolvedValueOnce([model]);

		const result = await generateChatAutomationArtifacts({
			userMessage: "Build a roadmap",
			assistantText: "Here is a plan",
			fallbackTitle: "Fallback",
			generateSuggestions: false,
		});

		expect(result).toEqual({ title: "Build a roadmap", suggestions: [] });
		expect(logHandledWarning).toHaveBeenCalledWith(
			"Failed to generate chat automation artifacts",
			expect.objectContaining({ error: "bad model" }),
		);
	});
});
