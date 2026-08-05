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
import { dbModule, fakeAgent } from "./agent-use-cases.test.chain";


export const fakeProvider = {
  id: "prov-1",
  workspaceId: "ws-1",
  kind: "openai",
  name: "OpenAI",
  baseUrl: null,
  authType: "bearer",
  encryptedApiKey: "enc:key",
  encryptedHeadersJson: null,
  queryParamsJson: null,
  enabled: true,
};

export const fakeModel = {
  id: "model-1",
  providerId: "prov-1",
  modelId: "gpt-4",
  displayName: "GPT-4",
  enabled: true,
};

// ─── canUseAgent ──────────────────────────────────────────────────────

describe("canUseAgent", () => {
  it("allows creator", () => {
    expect(canUseAgent(fakeAgent as never, "user-1")).toBe(true);
  });

  it("allows global agents", () => {
    expect(
      canUseAgent({ ...fakeAgent, isGlobal: true } as never, "other"),
    ).toBe(true);
  });

  it("allows marketplace agents", () => {
    expect(
      canUseAgent(
        { ...fakeAgent, sharingMode: "marketplace" } as never,
        "other",
      ),
    ).toBe(true);
  });

  it("allows specific_user target", () => {
    expect(
      canUseAgent(
        {
          ...fakeAgent,
          sharingMode: "specific_user",
          shareTargetUserId: "user-2",
        } as never,
        "user-2",
      ),
    ).toBe(true);
  });

  it("denies other users for personal agents", () => {
    expect(canUseAgent(fakeAgent as never, "other")).toBe(false);
  });

  it("denies wrong specific_user target", () => {
    expect(
      canUseAgent(
        {
          ...fakeAgent,
          sharingMode: "specific_user",
          shareTargetUserId: "user-2",
        } as never,
        "user-3",
      ),
    ).toBe(false);
  });
});

// ─── getAgentById ─────────────────────────────────────────────────────

describe("getAgentById", () => {
  it("returns null when not found", async () => {
    const result = await getAgentById("nonexistent", "ws-1");
    expect(result).toBeNull();
  });

  it("returns agent when found", async () => {
    dbModule._c.limit.mockResolvedValueOnce([fakeAgent]);
    const result = await getAgentById("agent-1", "ws-1");
    expect(result).toEqual(fakeAgent);
  });
});

// ─── getVisibleAgentById ──────────────────────────────────────────────

describe("getVisibleAgentById", () => {
  it("returns null when agent not found", async () => {
    const result = await getVisibleAgentById(
      "nonexistent",
      "ws-1",
      "user-1",
      false,
    );
    expect(result).toBeNull();
  });

  it("returns agent for creator", async () => {
    dbModule._c.limit.mockResolvedValueOnce([fakeAgent]);
    const result = await getVisibleAgentById(
      "agent-1",
      "ws-1",
      "user-1",
      false,
    );
    expect(result).toEqual(fakeAgent);
  });

  it("does not expose another user's personal agent to admins", async () => {
    dbModule._c.limit.mockResolvedValueOnce([fakeAgent]);
    const result = await getVisibleAgentById("agent-1", "ws-1", "other", true);
    expect(result).toBeNull();
  });

  it("returns null when non-creator and not admin", async () => {
    dbModule._c.limit.mockResolvedValueOnce([fakeAgent]);
    const result = await getVisibleAgentById("agent-1", "ws-1", "other", false);
    expect(result).toBeNull();
  });
});

// ─── listAgents ───────────────────────────────────────────────────────

describe("listAgents", () => {
  it("returns visible agents for workspace (admin)", async () => {
    dbModule._c.orderBy.mockResolvedValueOnce([fakeAgent]);
    await listAgents("ws-1", "user-1", true);
    // Admin curation does not bypass personal-agent visibility.
    expect(dbModule._c.orderBy).toHaveBeenCalled();
  });

  it("returns agents for workspace (non-admin)", async () => {
    dbModule._c.orderBy.mockResolvedValueOnce([fakeAgent]);
    await listAgents("ws-1", "user-1", false);
    expect(dbModule._c.orderBy).toHaveBeenCalled();
  });
});
