import { updateAgent } from "@/modules/agent/use-cases";
import { insertToolBindingsForVersion } from "@/modules/tool/use-cases.insert-tool-bindings-for-version";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/server/infrastructure/db";
import {
  mcpServers,
  mcpTools,
  resourceOrganizationShares,
  toolConnectors,
  toolConnections,
} from "@/server/infrastructure/db/schema";
import { createSharingFixture } from "./resource-sharing-db.fixture";
import { setResourceOrganizations } from "@/modules/iam/organization-resource-sharing";
import { getToolBindingsForVersion } from "@/modules/tool/use-cases.tool-binding-input-schema";
import {
  getMcpBindingContext,
  getAvailableMcpToolContext,
  cloneToolBindings,
} from "@/modules/tool/use-cases.clone-tool-bindings";

const suite = process.env.IAM_INTEGRATION_DATABASE_URL
  ? describe.sequential
  : describe.skip;
suite("MCP bindings distributed to another organization", () => {
  let source: Awaited<ReturnType<typeof createSharingFixture>>;
  let target: Awaited<ReturnType<typeof createSharingFixture>>;
  let serverId: string,
    toolId: string,
    connectionId: string,
    foreignConnectionId: string;
  let versionId: string;
  beforeAll(async () => {
    source = await createSharingFixture();
    target = await createSharingFixture();
    const [server] = await db
      .insert(mcpServers)
      .values({
        workspaceId: source.workspaceId,
        createdById: source.owner,
        name: "Shared ServiceNow",
        transport: "streamable-http",
        url: "https://example.test/mcp",
      })
      .returning();
    serverId = server.id;
    const [tool] = await db
      .insert(mcpTools)
      .values({ mcpServerId: serverId, name: "read_incidents" })
      .returning();
    toolId = tool.id;
    const [connector] = await db
      .insert(toolConnectors)
      .values({
        workspaceId: target.workspaceId,
        createdById: target.member,
        key: "shared-servicenow",
        name: "ServiceNow",
        kind: "mcp",
        mcpServerId: serverId,
      })
      .returning();
    const connections = await db
      .insert(toolConnections)
      .values(
        [target.member, target.owner].map((ownerUserId) => ({
          workspaceId: target.workspaceId,
          connectorId: connector.id,
          ownerType: "user" as const,
          ownerUserId,
          label: "Personal ServiceNow",
          configJson: { instanceUrl: "https://example.service-now.com" },
        })),
      )
      .returning();
    connectionId = connections[0].id;
    foreignConnectionId = connections[1].id;
    versionId = (
      await target.makeAgent("Recipient assistant", { creator: target.member })
    ).version.id;
  }, 60000);
  afterAll(async () => {
    if (serverId)
      await db
        .delete(resourceOrganizationShares)
        .where(eq(resourceOrganizationShares.resourceId, serverId));
    if (target) await target.cleanup();
    if (source) await source.cleanup();
  });
  const binding = () => ({
    toolSource: "mcp" as const,
    toolId,
    mcpServerId: serverId,
    connectionIds: [connectionId],
  });
  const save = () =>
    insertToolBindingsForVersion(versionId, [binding()], target.workspaceId, {
      userId: target.member,
    });
  const share = (organizationIds: string[]) =>
    setResourceOrganizations({
      actorUserId: source.owner,
      resourceType: "mcp_server",
      resourceId: serverId,
      includeDependencies: false,
      organizationIds,
    });
  it("rejects an unshared foreign server", async () => {
    await expect(save()).rejects.toThrow("MCP tool not found");
  });
  it("saves and reloads shared tools with the recipient's personal connection", async () => {
    await share([target.organizationId]);
    await save();
    const rows = await getToolBindingsForVersion(versionId, {
      workspaceId: target.workspaceId,
      userId: target.member,
    });
    expect(rows).toEqual([
      expect.objectContaining({ toolId, connectionIds: [connectionId] }),
    ]);
    expect(
      await getMcpBindingContext(
        versionId,
        toolId,
        target.member,
        target.workspaceId,
      ),
    ).toMatchObject({ server: { id: serverId } });
    expect(
      await getAvailableMcpToolContext(
        toolId,
        target.member,
        target.workspaceId,
      ),
    ).toMatchObject({ server: { id: serverId } });
    const next = (
      await target.makeAgent("Cloned config", { creator: target.member })
    ).version.id;
    await cloneToolBindings(versionId, next, target.workspaceId, {
      userId: target.member,
    });
    expect(
      await getToolBindingsForVersion(next, {
        workspaceId: target.workspaceId,
        userId: target.member,
      }),
    ).toEqual([
      expect.objectContaining({ toolId, connectionIds: [connectionId] }),
    ]);
  });
  it("updates an assistant through the same versioned use case as PATCH", async () => {
    const { agent } = await target.makeAgent("PATCH regression", {
      creator: target.member,
    });
    const { version } = await updateAgent({
      agentId: agent.id,
      workspaceId: target.workspaceId,
      userId: target.member,
      baseVersionId: agent.activeVersionId,
      toolBindings: [binding()],
    });
    expect(
      await getToolBindingsForVersion(version.id, {
        workspaceId: target.workspaceId,
        userId: target.member,
      }),
    ).toEqual([
      expect.objectContaining({ toolId, connectionIds: [connectionId] }),
    ]);
  });
  it("rejects another user's personal connection", async () => {
    await expect(
      insertToolBindingsForVersion(
        versionId,
        [{ ...binding(), connectionIds: [foreignConnectionId] }],
        target.workspaceId,
        { userId: target.member },
      ),
    ).rejects.toThrow("MCP connection not found");
  });
  it("rejects disabled or archived servers", async () => {
    await db
      .update(mcpServers)
      .set({ enabled: false })
      .where(eq(mcpServers.id, serverId));
    await expect(save()).rejects.toThrow("MCP tool not found");
    await db
      .update(mcpServers)
      .set({ enabled: true, archivedAt: new Date() })
      .where(eq(mcpServers.id, serverId));
    await expect(save()).rejects.toThrow("MCP tool not found");
    await db
      .update(mcpServers)
      .set({ archivedAt: null })
      .where(eq(mcpServers.id, serverId));
  });
  it("revokes save, read and execution context when distribution is removed", async () => {
    await share([]);
    await expect(save()).rejects.toThrow("MCP tool not found");
    expect(
      await getToolBindingsForVersion(versionId, {
        workspaceId: target.workspaceId,
        userId: target.member,
      }),
    ).toEqual([]);
    expect(
      await getMcpBindingContext(
        versionId,
        toolId,
        target.member,
        target.workspaceId,
      ),
    ).toBeNull();
    expect(
      await getAvailableMcpToolContext(
        toolId,
        target.member,
        target.workspaceId,
      ),
    ).toBeNull();
  });
});
