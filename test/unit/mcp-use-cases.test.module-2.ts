import { describe, expect, it, vi } from "vitest";

import { listRemoteMcpTools } from "@/modules/mcp/client";
import {
  createMcpServer,
  createMcpServerWithDiscovery,
  getMcpServer,
  hasMcpConnectionChanges,
  listMcpServers,
  updateMcpServer,
  updateMcpServerWithDiscovery,
} from "@/modules/mcp/use-cases";
import {
  dbModule,
  fakeSseServer,
  fakeStdioServer,
} from "./mcp-use-cases.test.db-module";

// ─── getMcpServer ─────────────────────────────────────────────────────

describe("getMcpServer", () => {
  it("returns null when server not found", async () => {
    const result = await getMcpServer("nonexistent", "ws-1");
    expect(result).toBeNull();
  });

  it("returns server when found", async () => {
    dbModule._c.limit.mockResolvedValueOnce([fakeSseServer]);
    const result = await getMcpServer("srv-1", "ws-1");
    expect(result).toEqual(fakeSseServer);
  });
});

// ─── listMcpServers ───────────────────────────────────────────────────

describe("listMcpServers", () => {
  it("returns mapped safe servers", async () => {
    dbModule._c.orderBy.mockResolvedValueOnce([fakeSseServer]);
    const result = await listMcpServers("ws-1");
    expect(result).toHaveLength(1);
    expect(result[0]).not.toHaveProperty("encryptedHeadersJson");
  });

  it("returns empty array when no servers", async () => {
    dbModule._c.orderBy.mockResolvedValueOnce([]);
    const result = await listMcpServers("ws-1");
    expect(result).toHaveLength(0);
  });
});

// ─── createMcpServer ──────────────────────────────────────────────────

describe("createMcpServer", () => {
  it("inserts server without encryption for empty headers/env", async () => {
    dbModule._c.returning.mockResolvedValueOnce([fakeSseServer]);
    const { encryptValue } = await import("@/lib/crypto");

    const result = await createMcpServer({
      workspaceId: "ws-1",
      userId: "user-1",
      name: "Test",
      transport: "sse",
      url: "https://example.com",
    });

    expect(dbModule.db.insert).toHaveBeenCalled();
    expect(encryptValue).not.toHaveBeenCalled();
    expect(result).toEqual(fakeSseServer);
  });

  it("encrypts headers on create", async () => {
    dbModule._c.returning.mockResolvedValueOnce([fakeSseServer]);
    const { encryptValue } = await import("@/lib/crypto");

    await createMcpServer({
      workspaceId: "ws-1",
      userId: "user-1",
      name: "Test",
      transport: "sse",
      url: "https://example.com",
      headers: { Authorization: "Bearer secret" },
    });

    expect(encryptValue).toHaveBeenCalledWith("Bearer secret");
  });

  it("encrypts env vars on create", async () => {
    dbModule._c.returning.mockResolvedValueOnce([fakeSseServer]);
    const { encryptValue } = await import("@/lib/crypto");

    await createMcpServer({
      workspaceId: "ws-1",
      userId: "user-1",
      name: "Test",
      transport: "stdio",
      command: "node server.js",
      env: { API_KEY: "secret" },
    });

    expect(encryptValue).toHaveBeenCalledWith("secret");
  });
});

describe("automatic MCP tool discovery", () => {
  it("discovers tools as part of server creation", async () => {
    dbModule._c.returning.mockResolvedValueOnce([fakeSseServer]);
    dbModule._c.where
      .mockReturnValueOnce(dbModule._c)
      .mockResolvedValueOnce([]);
    dbModule._c.limit.mockResolvedValueOnce([fakeSseServer]);
    vi.mocked(listRemoteMcpTools).mockResolvedValueOnce([
      { name: "search", description: "Search" },
    ] as never);

    const result = await createMcpServerWithDiscovery({
      workspaceId: "ws-1",
      userId: "user-1",
      name: "Test",
      transport: "sse",
      url: "https://example.com",
    });

    expect(result.discovery).toEqual({ status: "healthy", discovered: 1 });
  });

  it("recognizes only connection fields as discovery triggers", () => {
    const base = {
      serverId: "srv-1",
      workspaceId: "ws-1",
      userId: "user-1",
    };

    expect(hasMcpConnectionChanges({ ...base, name: "Renamed" })).toBe(false);
    expect(hasMcpConnectionChanges({ ...base, enabled: false })).toBe(false);
    expect(hasMcpConnectionChanges({ ...base, url: "https://new.test" })).toBe(
      true,
    );
    expect(hasMcpConnectionChanges({ ...base, headers: {} })).toBe(true);
  });

  it("does not rediscover tools for approval-only updates", async () => {
    dbModule._c.limit.mockResolvedValueOnce([fakeSseServer]);
    dbModule._c.returning.mockResolvedValueOnce([
      { ...fakeSseServer, requireApproval: true },
    ]);

    const result = await updateMcpServerWithDiscovery({
      serverId: "srv-1",
      workspaceId: "ws-1",
      userId: "user-1",
      requireApproval: true,
    });

    expect(result.discovery).toBeNull();
    expect(listRemoteMcpTools).not.toHaveBeenCalled();
  });
});

// ─── updateMcpServer ──────────────────────────────────────────────────

describe("updateMcpServer", () => {
  it("throws when server not found", async () => {
    await expect(
      updateMcpServer({
        serverId: "srv-1",
        workspaceId: "ws-1",
        userId: "user-1",
        transport: "sse",
        url: "https://example.com",
      }),
    ).rejects.toThrow("MCP server not found");
  });

  it("throws when switching to sse without url", async () => {
    dbModule._c.limit.mockResolvedValueOnce([{ ...fakeStdioServer }]);

    await expect(
      updateMcpServer({
        serverId: "srv-2",
        workspaceId: "ws-1",
        userId: "user-1",
        transport: "sse",
      }),
    ).rejects.toThrow("URL is required for remote transport");
  });

  it("throws when switching to stdio without command", async () => {
    dbModule._c.limit.mockResolvedValueOnce([{ ...fakeSseServer }]);

    await expect(
      updateMcpServer({
        serverId: "srv-1",
        workspaceId: "ws-1",
        userId: "user-1",
        transport: "stdio",
        command: "",
      }),
    ).rejects.toThrow("Command is required for stdio transport");
  });

  it("updates server fields and returns updated server", async () => {
    dbModule._c.limit.mockResolvedValueOnce([fakeSseServer]);
    dbModule._c.returning.mockResolvedValueOnce([
      { ...fakeSseServer, name: "Updated" },
    ]);

    const result = await updateMcpServer({
      serverId: "srv-1",
      workspaceId: "ws-1",
      userId: "user-1",
      name: "Updated",
    });

    expect(result).toEqual({ ...fakeSseServer, name: "Updated" });
  });

  it("merges encrypted headers when updating existing headers", async () => {
    dbModule._c.limit.mockResolvedValueOnce([
      { ...fakeSseServer, encryptedHeadersJson: { Authorization: "enc:old" } },
    ]);
    dbModule._c.returning.mockResolvedValueOnce([fakeSseServer]);
    const { decryptValue, encryptValue } = await import("@/lib/crypto");

    await updateMcpServer({
      serverId: "srv-1",
      workspaceId: "ws-1",
      userId: "user-1",
      headers: { "X-New": "new-value" },
    });

    expect(decryptValue).toHaveBeenCalledWith("enc:old");
    expect(encryptValue).toHaveBeenCalledWith("new-value");
  });
});
