import { getWorkspaceUsageAnalytics } from "@/modules/usage/analytics";
import { resolveUsageBillingWorkspace } from "@/modules/usage/billing-scope";
import { priceAgentRunUsage } from "@/modules/agent/run-usage-pricing";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/modules/admin/auth", () => ({
  isPlatformAdminSession: async (session: { user: { role?: string } }) =>
    session.user.role === "admin",
}));
import { eq, inArray } from "drizzle-orm";
import { db } from "@/server/infrastructure/db";
import {
  aiModels,
  aiProviders,
  auditEvents,
  teams,
  teamMembers,
  usageEvents,
  conversations,
} from "@/server/infrastructure/db/schema";
import { analyticsQuerySchema } from "@/modules/analytics/query";
import { getUsageAnalytics } from "@/modules/analytics/usage";
import { getAuditAnalytics } from "@/modules/analytics/audit";
import {
  listAnalyticsScopes,
  authorizeAnalytics,
} from "@/modules/analytics/scope";
import { runWithRequestAuth } from "@/modules/auth/request-auth-context";
import { createSharingFixture } from "./resource-sharing-db.fixture";
const suite = process.env.IAM_INTEGRATION_DATABASE_URL
  ? describe.sequential
  : describe.skip;
suite("scoped analytics with real PostgreSQL aggregation", () => {
  let f: Awaited<ReturnType<typeof createSharingFixture>>;
  let other: typeof f;
  let provider: string, model: string;
  let teamIds: string[];
  const operation = `test-${randomUUID().slice(0, 8)}`;
  const session = (id: string, role = "user") =>
    ({ user: { id, role } }) as Parameters<typeof listAnalyticsScopes>[0];
  const query = (extra: Record<string, unknown> = {}) =>
    analyticsQuerySchema.parse({
      scope: "organization",
      scopeId: f.organizationId,
      operation,
      limit: 10,
      ...extra,
    });
  beforeAll(async () => {
    f = await createSharingFixture();
    other = await createSharingFixture();
    const [p] = await db
      .insert(aiProviders)
      .values({
        workspaceId: f.workspaceId,
        name: "Analytics provider",
        kind: "openai-compatible",
        authType: "bearer",
        createdById: f.owner,
      })
      .returning();
    provider = p.id;
    const [m] = await db
      .insert(aiModels)
      .values({
        providerId: provider,
        modelId: "raw-model-name",
        displayName: null,
        enabled: true,
      })
      .returning();
    model = m.id;
    const rows = await db
      .insert(teams)
      .values(
        ["One", "Two"].map((name) => ({
          organizationId: f.organizationId,
          name,
          slug: randomUUID(),
          createdById: f.owner,
        })),
      )
      .returning();
    teamIds = rows.map((row) => row.id);
    await db
      .insert(teamMembers)
      .values(teamIds.map((teamId) => ({ teamId, userId: f.member })));
    await db.insert(usageEvents).values(
      Array.from({ length: 125 }, (_, index) => ({
        workspaceId: index % 2 ? f.workspaceId : f.destinationId,
        userId: f.member,
        providerId: provider,
        modelId: model,
        operation,
        inputTokens: 10,
        outputTokens: 2,
        latencyMs: index % 2 ? 100 : 200,
        status: index === 0 ? "failed" : index === 1 ? "timed_out" : "success",
        metadataJson: {
          cost: index === 0 ? "bad" : "1e-3",
          currency: index === 1 ? "EUR" : "USD",
        },
        createdAt: new Date("2026-09-10T12:00:00Z"),
      })),
    );
    await db.insert(usageEvents).values({
      workspaceId: other.workspaceId,
      userId: other.member,
      operation,
      inputTokens: 99999,
      costUsd: "999",
      createdAt: new Date("2026-09-10T12:00:00Z"),
    });
    await db.insert(auditEvents).values(
      Array.from({ length: 120 }, () => ({
        workspaceId: f.workspaceId,
        actorPrincipalId: f.member,
        action: operation,
        outcome: "success",
      })),
    );
    await db.insert(auditEvents).values([
      {
        organizationId: f.organizationId,
        actorPrincipalId: f.owner,
        action: operation,
        outcome: "denied",
      },
      {
        organizationId: other.organizationId,
        workspaceId: f.workspaceId,
        action: operation,
        outcome: "failed",
      },
    ]);
  }, 60000);
  afterAll(async () => {
    if (!f) return;
    await db
      .delete(usageEvents)
      .where(inArray(usageEvents.operation, [operation, `${operation}-bill`]));
    await db.delete(auditEvents).where(eq(auditEvents.action, operation));
    await db.delete(teams).where(inArray(teams.id, teamIds));
    await f.cleanup();
    await other.cleanup();
  });
  it("attributes shared assistants to the consuming project and retains that scope after the conversation is removed", async () => {
    const [conversation] = await db
      .insert(conversations)
      .values({
        workspaceId: other.workspaceId,
        billingWorkspaceId: f.workspaceId,
        agentId: randomUUID(),
        userId: f.member,
      })
      .returning();
    expect(
      await resolveUsageBillingWorkspace(other.workspaceId, conversation.id),
    ).toBe(f.workspaceId);
    expect(await resolveUsageBillingWorkspace(other.workspaceId)).toBe(
      other.workspaceId,
    );
    await db.insert(usageEvents).values({
      workspaceId: other.workspaceId,
      billingWorkspaceId: f.workspaceId,
      conversationId: conversation.id,
      userId: f.member,
      operation: `${operation}-bill`,
      inputTokens: 42,
      costUsd: "0.1",
    });
    const report = () =>
      getUsageAnalytics(
        query({ operation: `${operation}-bill`, groupBy: "workspace" }),
      );
    expect((await report()).groups[0]).toMatchObject({
      id: f.workspaceId,
      inputTokens: 42,
    });
    expect(
      (
        await getUsageAnalytics(
          query({
            scopeId: other.organizationId,
            operation: `${operation}-bill`,
          }),
        )
      ).totals.events,
    ).toBe(0);
    expect(
      (
        await getWorkspaceUsageAnalytics({
          workspaceId: other.workspaceId,
          limit: 10,
          operation: `${operation}-bill`,
        })
      ).totals.events,
    ).toBe(0);
    await db.delete(conversations).where(eq(conversations.id, conversation.id));
    expect((await report()).totals.events).toBe(1);
  });
  it("records run prices using its own model and currency rather than a parent tree total", async () => {
    await db
      .update(aiModels)
      .set({
        inputTokenCost: "2",
        outputTokenCost: "4",
        sustainabilityConfigJson: { currency: "USD" },
      })
      .where(eq(aiModels.id, model));
    const priced = await db.transaction((tx) =>
      priceAgentRunUsage(tx, {
        providerId: provider,
        modelId: model,
        inputTokens: 1000000,
        outputTokens: 500000,
      }),
    );
    expect(priced).toMatchObject({
      costUsd: "4",
      metadataJson: { cost: 4, currency: "USD" },
    });
    await db
      .update(aiModels)
      .set({ sustainabilityConfigJson: { currency: "EUR" } })
      .where(eq(aiModels.id, model));
    const euro = await db.transaction((tx) =>
      priceAgentRunUsage(tx, {
        modelId: model,
        inputTokens: 1000000,
        outputTokens: 0,
      }),
    );
    expect(euro).toMatchObject({
      costUsd: null,
      metadataJson: { cost: 2, currency: "EUR" },
    });
    expect(
      await priceAgentRunUsage(db, {
        modelId: randomUUID(),
        inputTokens: 1,
        outputTokens: 1,
      }),
    ).toMatchObject({ costUsd: null, metadataJson: { cost: null } });
    expect(
      await priceAgentRunUsage(db, { inputTokens: 0, outputTokens: 0 }),
    ).toMatchObject({ costUsd: null, metadataJson: { cost: null } });
  });
  it("aggregates all rows, preserves currencies and malformed/unpriced costs, and includes sibling projects", async () => {
    const data = await getUsageAnalytics(query());
    expect(data.events).toHaveLength(10);
    expect(data.totals.events).toBe(125);
    expect(data.totals.inputTokens).toBe(1250);
    expect(data.totals.unpricedEvents).toBe(1);
    expect(data.totals.failedEvents).toBe(2);
    expect(data.totals.costs).toEqual(
      expect.arrayContaining([
        { currency: "EUR", amount: 0.001 },
        { currency: "USD", amount: 0.123 },
      ]),
    );
    expect(data.facets.modelIds[0].name).toContain("raw-model-name");
    expect(data.facets.workspaceIds.map((row) => row.id).sort()).toEqual(
      [f.workspaceId, f.destinationId].sort(),
    );
    const next = await getUsageAnalytics(query({ offset: 10 }));
    expect(next.events[0].id).not.toBe(data.events[0].id);
    expect(next.totals.events).toBe(125);
  });
  it("filters providers, models, users, teams, projects and date boundaries without duplicate memberships", async () => {
    const data = await getUsageAnalytics(
      query({
        teamIds: teamIds.join(","),
        providerIds: provider,
        modelIds: model,
        userIds: f.member,
        from: "2026-09-10T12:00:00Z",
        to: "2026-09-10T12:00:00Z",
      }),
    );
    expect(data.totals.events).toBe(125);
    expect(
      (await getUsageAnalytics(query({ workspaceIds: other.workspaceId })))
        .totals.events,
    ).toBe(0);
    expect(
      (await getUsageAnalytics(query({ providerIds: randomUUID() }))).totals
        .events,
    ).toBe(0);
    expect(
      (await getUsageAnalytics(query({ from: "2026-09-11T00:00:00Z" }))).totals
        .events,
    ).toBe(0);
    for (const groupBy of [
      "model",
      "user",
      "workspace",
      "organization",
      "agent",
      "operation",
    ]) {
      const grouped = await getUsageAnalytics(
        query({ groupBy, bucket: "month" }),
      );
      expect(grouped.groups.reduce((sum, row) => sum + row.events, 0)).toBe(
        125,
      );
      expect(grouped.series[0].date).toBe("2026-09-01");
    }
  });
  it("audit totals cover every result, include organization-only events and preserve explicit historical organization", async () => {
    const data = await getAuditAnalytics(query({ action: operation }));
    expect(data.totals).toEqual({
      total: 121,
      success: 120,
      failed: 0,
      denied: 1,
    });
    expect(data.events).toHaveLength(10);
    expect(
      (await getAuditAnalytics(query({ action: operation, outcome: "denied" })))
        .totals.total,
    ).toBe(1);
    expect(
      (await getAuditAnalytics(query({ action: operation, userIds: f.member })))
        .totals.total,
    ).toBe(120);
  });
  it("authorizes application admins, organization owners and project roles without crossing scope", async () => {
    for (const kind of ["usage", "audit"] as const) {
      expect(
        await authorizeAnalytics(session(f.owner), kind, query()),
      ).toMatchObject({ id: f.organizationId });
      expect(
        await authorizeAnalytics(
          session(f.owner),
          kind,
          query({ scopeId: other.organizationId }),
        ),
      ).toBeUndefined();
      expect(
        await authorizeAnalytics(session(f.member), kind, query()),
      ).toBeUndefined();
      expect(
        await authorizeAnalytics(
          session(f.owner),
          kind,
          query({ scope: "application" }),
        ),
      ).toBeUndefined();
      expect(
        await authorizeAnalytics(
          session(f.owner, "admin"),
          kind,
          query({ scope: "application" }),
        ),
      ).toMatchObject({ type: "application" });
    }
    expect(
      await runWithRequestAuth(
        {
          type: "api_key",
          userId: f.owner,
          workspaceId: f.workspaceId,
          scopes: ["*"],
          apiKeyId: randomUUID(),
        } as Parameters<typeof runWithRequestAuth>[0],
        () => listAnalyticsScopes(session(f.owner, "admin"), "usage"),
      ),
    ).toEqual([]);
  });
});
