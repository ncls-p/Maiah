import { beforeEach, describe, expect, it, vi } from "vitest";

const sdkMocks = vi.hoisted(() => ({
	connect: vi.fn(),
	request: vi.fn(),
	transportClose: vi.fn(),
	clientClose: vi.fn(),
	transports: [] as Array<{
		kind: string;
		url: string;
		headers: HeadersInit | undefined;
	}>,
}));

const cryptoMocks = vi.hoisted(() => ({
	decryptValue: vi.fn(async (value: string) => `decrypted:${value}`),
}));

vi.mock("@modelcontextprotocol/sdk/client/index.js", () => ({
	Client: class {
		connect = sdkMocks.connect;
		request = sdkMocks.request;
		close = sdkMocks.clientClose;
	},
}));

vi.mock("@modelcontextprotocol/sdk/client/sse.js", () => ({
	SSEClientTransport: class {
		constructor(url: URL, options: { requestInit?: RequestInit }) {
			sdkMocks.transports.push({
				kind: "sse",
				url: url.toString(),
				headers: options.requestInit?.headers,
			});
		}
		close = sdkMocks.transportClose;
	},
}));

vi.mock("@modelcontextprotocol/sdk/client/streamableHttp.js", () => ({
	StreamableHTTPClientTransport: class {
		constructor(url: URL, options: { requestInit?: RequestInit }) {
			sdkMocks.transports.push({
				kind: "streamable-http",
				url: url.toString(),
				headers: options.requestInit?.headers,
			});
		}
		close = sdkMocks.transportClose;
	},
}));

vi.mock("@modelcontextprotocol/sdk/types.js", () => ({
	CallToolResultSchema: { schema: "call" },
	ListToolsResultSchema: { schema: "list" },
}));

vi.mock("@/lib/crypto", () => ({
	decryptValue: cryptoMocks.decryptValue,
}));

import {
	callRemoteMcpTool,
	listRemoteMcpTools,
} from "../../src/modules/mcp/client";

function server(overrides: Record<string, unknown> = {}) {
	return {
		id: "server-1",
		workspaceId: "ws-1",
		name: "Remote MCP",
		transport: "sse",
		command: null,
		argsJson: null,
		url: "https://mcp.test/sse",
		encryptedHeadersJson: null,
		encryptedEnvJson: null,
		enabled: true,
		requireApproval: false,
		isGlobal: false,
		healthStatus: "unknown",
		lastCheckedAt: null,
		createdById: "user-1",
		archivedAt: null,
		createdAt: new Date(),
		updatedAt: new Date(),
		...overrides,
	};
}

beforeEach(() => {
	vi.clearAllMocks();
	sdkMocks.transports.length = 0;
	sdkMocks.connect.mockResolvedValue(undefined);
	sdkMocks.transportClose.mockResolvedValue(undefined);
	sdkMocks.request.mockResolvedValue({ tools: [] });
	cryptoMocks.decryptValue.mockImplementation(
		async (value: string) => `decrypted:${value}`,
	);
});

describe("listRemoteMcpTools", () => {
	it("connects with SSE transport, lists tools, and closes the transport", async () => {
		sdkMocks.request.mockResolvedValueOnce({
			tools: [{ name: "search", description: "Search" }],
		});

		const result = await listRemoteMcpTools(server() as never);

		expect(result).toEqual([{ name: "search", description: "Search" }]);
		expect(sdkMocks.connect).toHaveBeenCalledTimes(1);
		expect(sdkMocks.request).toHaveBeenCalledWith(
			{ method: "tools/list", params: {} },
			{ schema: "list" },
		);
		expect(sdkMocks.transportClose).toHaveBeenCalledTimes(1);
		expect(sdkMocks.transports[0]).toMatchObject({
			kind: "sse",
			url: "https://mcp.test/sse",
		});
	});

	it("decrypts configured request headers", async () => {
		await listRemoteMcpTools(
			server({
				encryptedHeadersJson: { Authorization: "token", "x-api-key": "key" },
			}) as never,
		);

		expect(cryptoMocks.decryptValue).toHaveBeenCalledWith("token");
		expect(cryptoMocks.decryptValue).toHaveBeenCalledWith("key");
		expect(sdkMocks.transports[0].headers).toEqual({
			Authorization: "decrypted:token",
			"x-api-key": "decrypted:key",
		});
	});

	it("falls back from streamable HTTP to SSE when the primary transport fails", async () => {
		sdkMocks.connect
			.mockRejectedValueOnce(new Error("stream failed"))
			.mockResolvedValueOnce(undefined);
		sdkMocks.request.mockResolvedValueOnce({ tools: [{ name: "fallback" }] });

		const result = await listRemoteMcpTools(
			server({ transport: "streamable-http" }) as never,
		);

		expect(result).toEqual([{ name: "fallback" }]);
		expect(sdkMocks.transports.map((item) => item.kind)).toEqual([
			"streamable-http",
			"sse",
		]);
		expect(sdkMocks.transportClose).toHaveBeenCalledTimes(2);
	});

	it("throws for missing or invalid URLs", async () => {
		await expect(
			listRemoteMcpTools(server({ url: null }) as never),
		).rejects.toThrow("MCP server URL is not configured");
		await expect(
			listRemoteMcpTools(server({ url: "not a url" }) as never),
		).rejects.toThrow("Invalid MCP server URL: not a url");
	});
});

describe("callRemoteMcpTool", () => {
	it("passes object tool input through to tools/call", async () => {
		sdkMocks.request.mockResolvedValueOnce({
			content: [{ type: "text", text: "ok" }],
		});

		const result = await callRemoteMcpTool(server() as never, "search", {
			query: "docs",
		});

		expect(result).toEqual({ content: [{ type: "text", text: "ok" }] });
		expect(sdkMocks.request).toHaveBeenCalledWith(
			{
				method: "tools/call",
				params: { name: "search", arguments: { query: "docs" } },
			},
			{ schema: "call" },
		);
	});

	it("normalizes null and primitive tool inputs to empty arguments", async () => {
		await callRemoteMcpTool(server() as never, "search", null);
		await callRemoteMcpTool(server() as never, "search", "plain text");

		expect(sdkMocks.request).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({ params: { name: "search", arguments: {} } }),
			expect.any(Object),
		);
		expect(sdkMocks.request).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({ params: { name: "search", arguments: {} } }),
			expect.any(Object),
		);
	});
});
