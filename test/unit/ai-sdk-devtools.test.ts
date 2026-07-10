import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	registerTelemetry: vi.fn(),
	DevToolsTelemetry: vi.fn(() => ({ name: "devtools" })),
}));

vi.mock("ai", () => ({ registerTelemetry: mocks.registerTelemetry }));
vi.mock("@ai-sdk/devtools", () => ({
	DevToolsTelemetry: mocks.DevToolsTelemetry,
}));
vi.mock("@/lib/logger", () => ({ logHandledWarning: vi.fn() }));

function clearRegistration() {
	delete (
		globalThis as typeof globalThis & {
			__aiHubAiSdkDevToolsRegistered?: boolean;
		}
	).__aiHubAiSdkDevToolsRegistered;
}

beforeEach(() => {
	vi.resetModules();
	vi.unstubAllEnvs();
	vi.clearAllMocks();
	clearRegistration();
});

afterEach(() => {
	vi.unstubAllEnvs();
	clearRegistration();
});

describe("AI SDK DevTools registration", () => {
	it("does not capture model payloads by default", async () => {
		vi.stubEnv("NODE_ENV", "development");
		const { registerAiSdkDevTools } = await import(
			"@/server/infrastructure/ai-sdk/devtools"
		);

		registerAiSdkDevTools();

		expect(mocks.registerTelemetry).not.toHaveBeenCalled();
	});

	it("allows an explicit local opt-in", async () => {
		vi.stubEnv("NODE_ENV", "development");
		vi.stubEnv("AI_SDK_DEVTOOLS", "true");
		const { registerAiSdkDevTools } = await import(
			"@/server/infrastructure/ai-sdk/devtools"
		);

		registerAiSdkDevTools();

		expect(mocks.registerTelemetry).toHaveBeenCalledOnce();
	});

	it("never registers raw-payload telemetry in production", async () => {
		vi.stubEnv("NODE_ENV", "production");
		vi.stubEnv("AI_SDK_DEVTOOLS", "true");
		const { registerAiSdkDevTools } = await import(
			"@/server/infrastructure/ai-sdk/devtools"
		);

		registerAiSdkDevTools();

		expect(mocks.registerTelemetry).not.toHaveBeenCalled();
	});
});
