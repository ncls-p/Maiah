import { startMcpOAuthServer } from "../fixtures/mcp-oauth-server";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertMcpUrl,
  isBlockedAddress,
  mcpFetch,
} from "@/modules/mcp/network";
afterEach(() => vi.unstubAllEnvs());
describe("MCP network boundaries", () => {
  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "169.254.169.254",
    "192.168.1.1",
    "::1",
    "::ffff:127.0.0.1",
    "fc00::1",
    "fe80::1",
    "not-an-ip",
  ])("rejects internal address %s", (address) => {
    expect(isBlockedAddress(address)).toBe(true);
  });
  it.each(["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"])(
    "allows public address %s",
    (address) => {
      expect(isBlockedAddress(address)).toBe(false);
    },
  );
  it.each([
    "http://example.com/mcp",
    "https://user:secret@example.com",
    "https://example.com/#fragment",
    "https://127.0.0.1",
    "https://[::1]",
    "file:///etc/passwd",
  ])("rejects URL %s", (url) => {
    expect(() => assertMcpUrl(url)).toThrow("MCP_URL_NOT_ALLOWED");
  });
  it("refuses remote redirects instead of forwarding credentials", async () => {
    const remote = await startMcpOAuthServer();
    vi.stubEnv("MCP_TRUSTED_ORIGINS", remote.origin);
    try {
      await expect(
        mcpFetch(`${remote.origin}/redirect`, {
          headers: { Authorization: "Bearer test" },
        }),
      ).rejects.toThrow("MCP_REDIRECT_NOT_ALLOWED");
    } finally {
      await remote.close();
    }
  });
  it("trusts only the explicitly configured origin including its port", () => {
    vi.stubEnv("MCP_TRUSTED_ORIGINS", "http://127.0.0.1:1234");
    expect(assertMcpUrl("http://127.0.0.1:1234/mcp").pathname).toBe("/mcp");
    expect(() => assertMcpUrl("http://127.0.0.1:1235/mcp")).toThrow();
    expect(() => assertMcpUrl("http://127.0.0.1:1234@evil.test")).toThrow();
  });
  it("blocks a hostname resolving to loopback at connection time", async () => {
    vi.stubEnv("MCP_TRUSTED_ORIGINS", "");
    await expect(mcpFetch("https://localhost:1/mcp")).rejects.toThrow();
  });
});
