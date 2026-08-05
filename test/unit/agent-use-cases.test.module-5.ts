import { beforeEach, describe, expect, it, vi } from "vitest";

import * as _dbModule from "@/server/infrastructure/db";
import {
  archiveAgent,
  canUseAgent,
  cloneAgent,
  createAgent,
  getAgentDefaultPreferences,
  getActiveVersion,
  getAgentById,
  getAgentVersionById,
  getAgentVersions,
  getConversationMessages,
  getConversationsByAgent,
  getVisibleAgentById,
  listAgents,
  recordUsageEvent,
  reorderOrganizationAgents,
  resolveProviderForVersion,
  setOrganizationDefaultAgent,
  setUserDefaultAgent,
  updateAgent,
} from "@/modules/agent/use-cases";
import { cloneKnowledgeBindings } from "@/modules/knowledge/use-cases";
import { cloneSkillBindings } from "@/modules/skills/use-cases";
import {
  cloneToolBindings,
  insertToolBindingsForVersion,
} from "@/modules/tool/use-cases";
import {
  cloneDelegationBindings,
  insertDelegationBindingsForVersion,
} from "@/modules/agent/delegation-use-cases";
import { dbModule, fakeVersion } from "./agent-use-cases.test.chain";
import { fakeModel, fakeProvider } from "./agent-use-cases.test.fake-provider";


// ─── getAgentVersions ─────────────────────────────────────────────────

describe("getAgentVersions", () => {
  it("returns versions in descending order", async () => {
    dbModule._c.orderBy.mockResolvedValueOnce([fakeVersion]);
    const result = await getAgentVersions("agent-1");
    expect(result).toHaveLength(1);
  });
});

// ─── getActiveVersion ─────────────────────────────────────────────────

describe("getActiveVersion", () => {
  it("returns null when agent has no active version", async () => {
    dbModule._c.limit.mockResolvedValueOnce([{ activeVersionId: null }]);
    const result = await getActiveVersion("agent-1");
    expect(result).toBeNull();
  });

  it("returns null when agent not found", async () => {
    dbModule._c.limit.mockResolvedValueOnce([]);
    const result = await getActiveVersion("nonexistent");
    expect(result).toBeNull();
  });

  it("returns version when found", async () => {
    dbModule._c.limit
      .mockResolvedValueOnce([{ activeVersionId: "v1" }])
      .mockResolvedValueOnce([fakeVersion]);
    const result = await getActiveVersion("agent-1");
    expect(result).toEqual(fakeVersion);
  });
});

// ─── resolveProviderForVersion ────────────────────────────────────────

describe("resolveProviderForVersion", () => {
  it("returns null when version has no providerId", async () => {
    const result = await resolveProviderForVersion({
      ...fakeVersion,
      providerId: null,
    } as never);
    expect(result).toBeNull();
  });

  it("returns null when provider not found", async () => {
    dbModule._c.limit.mockResolvedValueOnce([]);
    const result = await resolveProviderForVersion(fakeVersion as never);
    expect(result).toBeNull();
  });

  it("resolves provider with decrypted API key", async () => {
    dbModule._c.limit
      .mockResolvedValueOnce([fakeProvider]) // provider
      .mockResolvedValueOnce([fakeModel]); // model

    const result = await resolveProviderForVersion(fakeVersion as never);

    expect(result).not.toBeNull();
    expect(result!.providerId).toBe("prov-1");
    expect(result!.modelId).toBe("gpt-4");
  });

  it("resolves provider without model when modelId is null", async () => {
    dbModule._c.limit.mockResolvedValueOnce([fakeProvider]);

    const result = await resolveProviderForVersion({
      ...fakeVersion,
      modelId: null,
    } as never);

    expect(result).not.toBeNull();
    expect(result!.modelId).toBe("");
  });

  it("decrypts headers when encryptedHeadersJson present", async () => {
    const { decryptValue } = await import("@/lib/crypto");
    dbModule._c.limit.mockResolvedValueOnce([
      { ...fakeProvider, encryptedHeadersJson: { "X-Key": "enc:header" } },
    ]);

    await resolveProviderForVersion({ ...fakeVersion, modelId: null } as never);

    expect(decryptValue).toHaveBeenCalledWith("enc:header");
  });
});

// ─── getConversationsByAgent ──────────────────────────────────────────

describe("getConversationsByAgent", () => {
  it("returns conversations for agent and user", async () => {
    const conv = { id: "conv-1", agentId: "agent-1", userId: "user-1" };
    dbModule._c.orderBy.mockResolvedValueOnce([conv]);

    const result = await getConversationsByAgent("agent-1", "user-1");
    expect(result).toHaveLength(1);
  });

  it("returns empty when no conversations", async () => {
    dbModule._c.orderBy.mockResolvedValueOnce([]);
    const result = await getConversationsByAgent("agent-1", "user-1");
    expect(result).toHaveLength(0);
  });
});
