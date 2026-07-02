import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// Mock env with importActual to preserve V8 coverage
vi.mock("@/lib/env", async () => {
	const actual = await vi.importActual<typeof import("@/lib/env")>("@/lib/env");
	return {
		...actual,
		env: {
			...(actual?.env ?? {}),
			NODE_ENV: "test",
		},
	};
});

describe("logger", async () => {
	const { logger, logHandledWarning, logHandledError } = await import("@/lib/logger");

	beforeEach(() => {
		vi.spyOn(process.stdout, "write").mockImplementation(() => true);
		vi.spyOn(process.stderr, "write").mockImplementation(() => true);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("debug writes to stdout in test mode", () => {
		logger.debug("test debug msg");
		expect(process.stdout.write).toHaveBeenCalledWith("debug: test debug msg\n");
	});

	it("info writes to stdout", () => {
		logger.info("test info msg");
		expect(process.stdout.write).toHaveBeenCalledWith("info: test info msg\n");
	});

	it("warn writes to stderr", () => {
		logger.warn("test warn msg");
		expect(process.stderr.write).toHaveBeenCalledWith("warn: test warn msg\n");
	});

	it("error writes to stderr", () => {
		logger.error("test error msg");
		expect(process.stderr.write).toHaveBeenCalledWith("error: test error msg\n");
	});

	it("error includes error details", () => {
		const err = new Error("boom");
		logger.error("failed", {}, err);
		expect(process.stderr.write).toHaveBeenCalledWith("error: failed\n");
	});

	it("logHandledWarning calls logger.warn", () => {
		logHandledWarning("warn msg", { key: "val" });
		expect(process.stderr.write).toHaveBeenCalledWith("warn: warn msg\n");
	});

	it("logHandledError calls logger.error", () => {
		logHandledError("err msg", { key: "val" });
		expect(process.stderr.write).toHaveBeenCalledWith("error: err msg\n");
	});

	it("logHandledError passes error", () => {
		logHandledError("err msg", {}, new Error("boom"));
		expect(process.stderr.write).toHaveBeenCalledWith("error: err msg\n");
	});
});