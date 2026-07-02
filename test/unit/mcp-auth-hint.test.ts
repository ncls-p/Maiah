import { describe, expect, it } from "vitest";
import { inferMcpAuthHint } from "@/modules/mcp/auth-hint";

describe("inferMcpAuthHint", () => {
	it("returns 'none' for stdio with no env or headers", () => {
		const result = inferMcpAuthHint({ transport: "stdio" });
		expect(result).toEqual({ mode: "none" });
	});

	it("returns 'env' for stdio with single env key", () => {
		const result = inferMcpAuthHint({
			transport: "stdio",
			encryptedEnvJson: { PATH: "val" },
		});
		expect(result).toEqual({ mode: "env", envKeyName: "PATH", envKeys: ["PATH"] });
	});

	it("returns 'custom' for stdio with multiple env keys", () => {
		const result = inferMcpAuthHint({
			transport: "stdio",
			encryptedEnvJson: { KEY1: "v", KEY2: "v" },
		});
		expect(result).toEqual({ mode: "custom", envKeys: ["KEY1", "KEY2"] });
	});

	it("returns 'custom' for stdio with headers only", () => {
		const result = inferMcpAuthHint({
			transport: "stdio",
			encryptedHeadersJson: { AUTH: "v" },
		});
		expect(result).toEqual({ mode: "custom", headerKeys: ["AUTH"] });
	});

	it("returns 'bearer' for http with authorization header", () => {
		const result = inferMcpAuthHint({
			transport: "http",
			encryptedHeadersJson: { Authorization: "v" },
		});
		expect(result).toEqual({ mode: "bearer", headerKeys: ["Authorization"] });
	});

	it("returns 'api-key' for http with single non-authorization header", () => {
		const result = inferMcpAuthHint({
			transport: "http",
			encryptedHeadersJson: { X_Api_Key: "v" },
		});
		expect(result).toEqual({ mode: "api-key", apiKeyHeader: "X_Api_Key", headerKeys: ["X_Api_Key"] });
	});

	it("returns 'custom' for http with multiple headers", () => {
		const result = inferMcpAuthHint({
			transport: "http",
			encryptedHeadersJson: { A: "v", B: "v" },
		});
		expect(result).toEqual({ mode: "custom", headerKeys: ["A", "B"] });
	});

	it("returns 'custom' for http with env keys", () => {
		const result = inferMcpAuthHint({
			transport: "http",
			encryptedEnvJson: { MY_KEY: "v" },
		});
		expect(result).toEqual({ mode: "custom", envKeys: ["MY_KEY"] });
	});

	it("returns 'none' for http with no headers or env", () => {
		const result = inferMcpAuthHint({ transport: "http" });
		expect(result).toEqual({ mode: "none" });
	});

	it("handles arrays as not records", () => {
		const result = inferMcpAuthHint({
			transport: "stdio",
			encryptedEnvJson: ["not", "a", "record"],
		});
		expect(result).toEqual({ mode: "none" });
	});

	it("handles null encrypted values", () => {
		const result = inferMcpAuthHint({
			transport: "stdio",
			encryptedEnvJson: null,
			encryptedHeadersJson: null,
		});
		expect(result).toEqual({ mode: "none" });
	});

	it("handles authorization header case insensitively", () => {
		const result = inferMcpAuthHint({
			transport: "http",
			encryptedHeadersJson: { authorization: "v" },
		});
		expect(result).toEqual({ mode: "bearer", headerKeys: ["authorization"] });
	});
});