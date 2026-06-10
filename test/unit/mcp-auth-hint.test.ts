import { describe, expect, it } from "vitest";

import { inferMcpAuthHint } from "@/modules/mcp/auth-hint";

describe("inferMcpAuthHint", () => {
	it("returns none when no credentials are configured", () => {
		expect(
			inferMcpAuthHint({
				transport: "sse",
				encryptedHeadersJson: null,
				encryptedEnvJson: null,
			}),
		).toEqual({ mode: "none" });
	});

	it("infers bearer auth from a single Authorization header", () => {
		expect(
			inferMcpAuthHint({
				transport: "sse",
				encryptedHeadersJson: { Authorization: "encrypted" },
			}),
		).toEqual({
			mode: "bearer",
			headerKeys: ["Authorization"],
		});
	});

	it("infers api-key auth from a single custom header", () => {
		expect(
			inferMcpAuthHint({
				transport: "streamable-http",
				encryptedHeadersJson: { "X-API-Key": "encrypted" },
			}),
		).toEqual({
			mode: "api-key",
			apiKeyHeader: "X-API-Key",
			headerKeys: ["X-API-Key"],
		});
	});

	it("infers env auth for stdio servers with one env variable", () => {
		expect(
			inferMcpAuthHint({
				transport: "stdio",
				encryptedEnvJson: { API_KEY: "encrypted" },
			}),
		).toEqual({
			mode: "env",
			envKeyName: "API_KEY",
			envKeys: ["API_KEY"],
		});
	});

	it("returns custom when multiple headers are configured", () => {
		expect(
			inferMcpAuthHint({
				transport: "sse",
				encryptedHeadersJson: {
					Authorization: "encrypted",
					"X-Tenant-Id": "encrypted",
				},
			}),
		).toEqual({
			mode: "custom",
			headerKeys: ["Authorization", "X-Tenant-Id"],
		});
	});

	it("returns custom for stdio servers with multiple env variables", () => {
		expect(
			inferMcpAuthHint({
				transport: "stdio",
				encryptedEnvJson: {
					API_KEY: "encrypted",
					API_SECRET: "encrypted",
				},
			}),
		).toEqual({
			mode: "custom",
			envKeys: ["API_KEY", "API_SECRET"],
		});
	});
});
