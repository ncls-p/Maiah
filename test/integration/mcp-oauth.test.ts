import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { eq } from "drizzle-orm";
import { db } from "@/server/infrastructure/db";
import {
  mcpServers,
  mcpTools,
  mcpOauthAttempts,
  mcpOauthCredentials,
  mcpSyncState,
} from "@/server/infrastructure/db/schema";
import { createSharingFixture } from "./resource-sharing-db.fixture";
import { startMcpOAuthServer } from "../fixtures/mcp-oauth-server";
import { configureOAuth, oauthStatus } from "@/modules/mcp/oauth/config";
import { beginOAuth, finishOAuth } from "@/modules/mcp/oauth/flow";
import { oauthHeaders, disconnectOAuth } from "@/modules/mcp/oauth/tokens";
import { getData, saveData } from "@/modules/mcp/oauth/store";
import { listRemoteMcpTools, callRemoteMcpTool } from "@/modules/mcp/client";
import { syncMcpTools } from "@/modules/mcp/use-cases.sync-mcp-tools";
import { scheduledSync, syncDelayMs } from "@/modules/mcp/sync-schedule";
const suite = process.env.IAM_INTEGRATION_DATABASE_URL
  ? describe.sequential
  : describe.skip;
suite("MCP OAuth, real HTTP and durable synchronization", () => {
  let f: Awaited<ReturnType<typeof createSharingFixture>>;
  let remote: Awaited<ReturnType<typeof startMcpOAuthServer>>;
  let server: typeof mcpServers.$inferSelect;
  const config = {
    enabled: true,
    clientId: "maiah-test",
    scopes: "tools.read",
  };
  async function authorize() {
    const { authorizationUrl } = await beginOAuth(
      server.id,
      f.workspaceId,
      f.owner,
    );
    const response = await fetch(authorizationUrl, { redirect: "manual" });
    const callback = new URL(response.headers.get("location")!);
    await finishOAuth(
      f.owner,
      callback.searchParams.get("state")!,
      callback.searchParams.get("code")!,
    );
    return callback;
  }
  beforeAll(async () => {
    remote = await startMcpOAuthServer();
    vi.stubEnv("MCP_TRUSTED_ORIGINS", remote.origin);
    f = await createSharingFixture();
    [server] = await db
      .insert(mcpServers)
      .values({
        workspaceId: f.workspaceId,
        createdById: f.owner,
        name: "OAuth test",
        transport: "streamable-http",
        url: `${remote.origin}/mcp`,
      })
      .returning();
  });
  afterAll(async () => {
    await db.delete(mcpServers).where(eq(mcpServers.id, server.id));
    await f.cleanup();
    await remote.close();
    vi.unstubAllEnvs();
  });
  it("configures only for a manager and never returns secrets", async () => {
    await expect(
      configureOAuth(server.id, f.workspaceId, f.outsider, config),
    ).rejects.toThrow();
    const safe = await configureOAuth(server.id, f.workspaceId, f.owner, {
      ...config,
      clientSecret: "client-private",
    });
    expect(safe.hasClientSecret).toBe(true);
    expect(JSON.stringify(safe)).not.toContain("client-private");
    await configureOAuth(server.id, f.workspaceId, f.owner, {
      ...config,
      clearSecret: true,
    });
    expect(
      (await oauthStatus(server.id, f.workspaceId, f.owner)).connected,
    ).toBe(false);
    await expect(
      listRemoteMcpTools(server, { userId: f.owner }),
    ).rejects.toThrow("MCP_OAUTH_CONNECT_REQUIRED");
  });
  it("completes discovery and PKCE, lists and calls tools with personal tokens", async () => {
    const callback = await authorize();
    expect(
      (await oauthStatus(server.id, f.workspaceId, f.owner)).connected,
    ).toBe(true);
    expect(await listRemoteMcpTools(server, { userId: f.owner })).toHaveLength(
      1,
    );
    expect(
      await callRemoteMcpTool(server, "search", {}, { userId: f.owner }),
    ).toMatchObject({ content: [{ text: "Found it" }] });
    await expect(oauthHeaders(server, f.member)).rejects.toThrow(
      "MCP_SERVER_NOT_FOUND",
    );
    await expect(
      finishOAuth(
        f.owner,
        callback.searchParams.get("state")!,
        callback.searchParams.get("code")!,
      ),
    ).rejects.toThrow("MCP_OAUTH_STATE_INVALID");
    const [row] = await db
      .select()
      .from(mcpOauthCredentials)
      .where(eq(mcpOauthCredentials.serverId, server.id));
    const data = await getData(server.id, f.owner);
    expect(row.encryptedData).not.toContain(data!.tokens!.access_token);
  });
  it("authenticates the initial SSE stream and supports HTTP fallback", async () => {
    remote.state.sse = true;
    try {
      expect(
        await listRemoteMcpTools(
          { ...server, transport: "sse" },
          { userId: f.owner },
        ),
      ).toHaveLength(1);
      expect(
        await listRemoteMcpTools(server, { userId: f.owner }),
      ).toHaveLength(1);
      expect(
        await callRemoteMcpTool(
          { ...server, transport: "sse" },
          "search",
          {},
          { userId: f.owner },
        ),
      ).toMatchObject({ content: [{ text: "Found it" }] });
    } finally {
      remote.state.sse = false;
    }
  });
  it("refreshes once across simultaneous uses and rotates refresh tokens", async () => {
    const data = (await getData(server.id, f.owner))!;
    const old = data.tokens!.refresh_token;
    data.expiresAt = 0;
    await saveData(server.id, f.owner, data);
    const before = remote.state.refreshes;
    const headers = await Promise.all([
      oauthHeaders(server, f.owner),
      oauthHeaders(server, f.owner),
    ]);
    expect(headers[0]).toEqual(headers[1]);
    expect(remote.state.refreshes - before).toBe(1);
    expect((await getData(server.id, f.owner))!.tokens!.refresh_token).not.toBe(
      old,
    );
  });
  it("rejects wrong users, expired callbacks, denial and changed configuration", async () => {
    const { authorizationUrl } = await beginOAuth(
      server.id,
      f.workspaceId,
      f.owner,
    );
    const state = new URL(authorizationUrl).searchParams.get("state")!;
    await expect(finishOAuth(f.member, state, "code")).rejects.toThrow(
      "MCP_OAUTH_STATE_INVALID",
    );
    await expect(
      finishOAuth(f.owner, state, undefined, "access_denied"),
    ).rejects.toThrow("MCP_OAUTH_DENIED");
    const attempt = await beginOAuth(server.id, f.workspaceId, f.owner);
    await db
      .update(mcpOauthAttempts)
      .set({ expiresAt: new Date(0) })
      .where(eq(mcpOauthAttempts.serverId, server.id));
    await expect(
      finishOAuth(
        f.owner,
        new URL(attempt.authorizationUrl).searchParams.get("state")!,
        "code",
      ),
    ).rejects.toThrow("MCP_OAUTH_STATE_INVALID");
    const stale = await beginOAuth(server.id, f.workspaceId, f.owner);
    await configureOAuth(server.id, f.workspaceId, f.owner, config);
    await expect(
      finishOAuth(
        f.owner,
        new URL(stale.authorizationUrl).searchParams.get("state")!,
        "code",
      ),
    ).rejects.toThrow("MCP_OAUTH_STATE_INVALID");
  });
  it("requires PKCE and explicit dynamic-registration consent", async () => {
    remote.state.pkce = false;
    await expect(beginOAuth(server.id, f.workspaceId, f.owner)).rejects.toThrow(
      "MCP_OAUTH_PKCE_REQUIRED",
    );
    remote.state.pkce = true;
    await expect(
      configureOAuth(server.id, f.workspaceId, f.owner, { enabled: true }),
    ).rejects.toThrow("MCP_OAUTH_CLIENT_REQUIRED");
    await configureOAuth(server.id, f.workspaceId, f.owner, {
      enabled: true,
      dynamicRegistration: true,
    });
    await authorize();
    expect(remote.state.registration).toBeGreaterThan(0);
  });
  it("preserves tool identities and user choices through changes and removals", async () => {
    await syncMcpTools(server.id, f.workspaceId, f.owner);
    const [tool] = await db
      .select()
      .from(mcpTools)
      .where(eq(mcpTools.mcpServerId, server.id));
    await db
      .update(mcpTools)
      .set({ enabled: false, requireApproval: true })
      .where(eq(mcpTools.id, tool.id));
    remote.state.tools[0].description = "Updated description";
    await syncMcpTools(server.id, f.workspaceId, f.owner);
    const [updated] = await db
      .select()
      .from(mcpTools)
      .where(eq(mcpTools.mcpServerId, server.id));
    expect(updated).toMatchObject({
      id: tool.id,
      enabled: false,
      requireApproval: true,
      description: "Updated description",
    });
    remote.state.tools = [];
    await syncMcpTools(server.id, f.workspaceId, f.owner);
    expect(
      await db.select().from(mcpTools).where(eq(mcpTools.id, tool.id)),
    ).toHaveLength(1);
  });
  it("coalesces manual/automatic sync and backs off without erasing tools", async () => {
    let release!: () => void;
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = scheduledSync(server.id, false, async () => {
      await waiting;
      return { status: "healthy", discovered: 0 };
    });
    await vi.waitFor(async () =>
      expect(
        (
          await db
            .select()
            .from(mcpSyncState)
            .where(eq(mcpSyncState.serverId, server.id))
        )[0].leaseId,
      ).toBeTruthy(),
    );
    expect(
      (
        await scheduledSync(server.id, false, async () => {
          throw new Error("must not run");
        })
      ).status,
    ).toBe("syncing");
    release();
    await first;
    remote.state.failList = true;
    expect((await syncMcpTools(server.id, f.workspaceId, f.owner)).status).toBe(
      "unhealthy",
    );
    remote.state.failList = false;
    const [schedule] = await db
      .select()
      .from(mcpSyncState)
      .where(eq(mcpSyncState.serverId, server.id));
    expect(schedule.failures).toBe(1);
    expect(schedule.nextSyncAt.getTime() - Date.now()).toBeGreaterThan(
      25 * 60_000,
    );
    expect(syncDelayMs(20, 0.5)).toBe(6 * 60 * 60_000);
  });
  it("invalidates revoked refresh tokens and disconnects locally and remotely", async () => {
    const data = (await getData(server.id, f.owner))!;
    data.expiresAt = 0;
    await saveData(server.id, f.owner, data);
    remote.state.tokenFailure = true;
    await expect(oauthHeaders(server, f.owner)).rejects.toThrow(
      "MCP_OAUTH_CONNECT_REQUIRED",
    );
    remote.state.tokenFailure = false;
    await authorize();
    expect(
      (await disconnectOAuth(server.id, f.workspaceId, f.owner)).revocation,
    ).toBe("revoked");
    expect(await getData(server.id, f.owner)).toBeUndefined();
    expect(remote.state.revocations).toBe(2);
  });
});
