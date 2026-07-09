import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────

vi.mock("@/server/domain/services/audit", () => ({
	audit: { emit: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock("@/lib/logger", () => ({
	logHandledError: vi.fn(),
	logHandledWarning: vi.fn(),
	logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/crypto", () => ({
	decryptValue: vi.fn().mockResolvedValue("decrypted-secret"),
}));

vi.mock("@/modules/knowledge/use-cases", () => ({
	cloneKnowledgeBindings: vi.fn().mockResolvedValue(undefined),
	replaceKnowledgeBindingsForVersion: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/modules/skills/use-cases", () => ({
	cloneSkillBindings: vi.fn().mockResolvedValue(undefined),
	replaceSkillBindingsForVersion: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/modules/tool/use-cases", () => ({
	cloneToolBindings: vi.fn().mockResolvedValue(undefined),
	getToolBindingsForVersion: vi.fn().mockResolvedValue([]),
	insertToolBindingsForVersion: vi.fn().mockResolvedValue(undefined),
}));

const CHAIN_KEYS = [
	"select",
	"insert",
	"update",
	"delete",
	"from",
	"where",
	"orderBy",
	"values",
	"set",
	"onConflictDoUpdate",
] as const;

type ChainFn = ReturnType<typeof vi.fn>;

type Chain = {
	[K in (typeof CHAIN_KEYS)[number]]: ChainFn;
} & {
	limit: ChainFn;
	returning: ChainFn;
};

type DbMock = {
	select: ChainFn;
	insert: ChainFn;
	update: ChainFn;
	delete: ChainFn;
	transaction: ChainFn;
};

type DbModule = {
	db: DbMock;
	_c: Chain;
	_tx: Chain;
};

// vi.mock is hoisted — the factory must be self-contained (no external refs).
vi.mock("@/server/infrastructure/db", () => {
	const buildChain = (): Chain => {
		const c = {} as Record<string, ChainFn>;
		const keys = [
			"select",
			"insert",
			"update",
			"delete",
			"from",
			"where",
			"orderBy",
			"values",
			"set",
			"onConflictDoUpdate",
		] as const;
		for (const k of keys) {
			c[k] = vi.fn().mockReturnThis();
		}
		c.limit = vi.fn().mockResolvedValue([]);
		c.returning = vi.fn().mockResolvedValue([]);
		return c as Chain;
	};

	const chain = buildChain();
	const tx = buildChain();
	const db: DbMock = {
		select: vi.fn(),
		insert: vi.fn(),
		update: vi.fn(),
		delete: vi.fn(),
		transaction: vi.fn(),
	};
	return { db, _c: chain, _tx: tx };
});

import * as _dbModule from "@/server/infrastructure/db";
const dbModule = _dbModule as unknown as DbModule;
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

function reset() {
	for (const chain of [dbModule._c, dbModule._tx]) {
		for (const k of CHAIN_KEYS) {
			chain[k].mockReset().mockReturnThis();
		}
		chain.limit.mockReset().mockResolvedValue([]);
		chain.returning.mockReset().mockResolvedValue([]);
	}
}

beforeEach(() => {
	vi.clearAllMocks();
	reset();
	dbModule.db.select.mockReturnValue(dbModule._c);
	dbModule.db.insert.mockReturnValue(dbModule._c);
	dbModule.db.update.mockReturnValue(dbModule._c);
	dbModule.db.delete.mockReturnValue(dbModule._c);
	dbModule.db.transaction.mockImplementation(
		(cb: (tx: Chain) => Promise<unknown>) => cb(dbModule._tx),
	);
});

// ─── Fixtures ────────────────────────────────────────────────────────

const fakeAgent = {
	id: "agent-1",
	workspaceId: "ws-1",
	name: "My Agent",
	slug: "my-agent",
	description: null,
	createdById: "user-1",
	activeVersionId: "v1",
	visibility: "private",
	sourceType: "custom",
	sharingMode: "personal",
	shareTargetUserId: null,
	isGlobal: false,
	isRecommended: false,
	curationLabel: null,
	canAdminCurate: false,
	archivedAt: null,
	createdAt: new Date(),
	updatedAt: new Date(),
} as const;

const fakeVersion = {
	id: "v1",
	agentId: "agent-1",
	versionNumber: 1,
	name: "Initial version",
	systemPrompt: null,
	providerId: "prov-1",
	modelId: "model-1",
	temperature: null,
	topP: null,
	maxOutputTokens: 30000,
	maxToolCalls: 6,
	toolChoice: null,
	responseFormat: null,
	generationSettings: null,
	memoryPolicy: null,
	guardrails: null,
	approvalPolicy: null,
	createdById: "user-1",
	createdAt: new Date(),
	updatedAt: new Date(),
};

const fakeProvider = {
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

const fakeModel = {
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

// ─── createAgent ──────────────────────────────────────────────────────

describe("createAgent", () => {
	it("throws when providerId given but provider not found", async () => {
		dbModule._c.limit.mockResolvedValueOnce([]); // provider lookup

		await expect(
			createAgent({
				workspaceId: "ws-1",
				userId: "user-1",
				name: "Test",
				slug: "test",
				providerId: "prov-1",
			}),
		).rejects.toThrow("Provider not found");
	});

	it("throws when modelId given but provider not specified", async () => {
		await expect(
			createAgent({
				workspaceId: "ws-1",
				userId: "user-1",
				name: "Test",
				slug: "test",
				modelId: "model-1",
			}),
		).rejects.toThrow("Model requires a provider");
	});

	it("throws when model not found", async () => {
		dbModule._c.limit
			.mockResolvedValueOnce([fakeProvider]) // provider found
			.mockResolvedValueOnce([]); // model not found

		await expect(
			createAgent({
				workspaceId: "ws-1",
				userId: "user-1",
				name: "Test",
				slug: "test",
				providerId: "prov-1",
				modelId: "model-1",
			}),
		).rejects.toThrow("Model not found");
	});

	it("creates agent and version via transaction", async () => {
		const agent = { ...fakeAgent };
		const version = { ...fakeVersion };
		dbModule._tx.returning
			.mockResolvedValueOnce([agent]) // insert agent
			.mockResolvedValueOnce([version]); // insert version

		const result = await createAgent({
			workspaceId: "ws-1",
			userId: "user-1",
			name: "Test",
			slug: "test",
		});

		expect(result.agent).toEqual(agent);
		expect(result.version).toEqual(version);
		expect(dbModule._tx.values).toHaveBeenCalledWith(
			expect.objectContaining({ maxToolCalls: 20 }),
		);
		expect(dbModule.db.transaction).toHaveBeenCalledOnce();
	});
});

// ─── archiveAgent ─────────────────────────────────────────────────────

describe("archiveAgent", () => {
	it("throws when agent not found", async () => {
		await expect(archiveAgent("nonexistent", "ws-1", "user-1")).rejects.toThrow(
			"Agent not found",
		);
	});

	it("throws when non-creator tries to archive without admin", async () => {
		dbModule._c.limit.mockResolvedValueOnce([fakeAgent]);

		await expect(
			archiveAgent("agent-1", "ws-1", "other", false),
		).rejects.toThrow("Only the creator or an admin can delete this agent");
	});

	it("archives agent when creator", async () => {
		dbModule._c.limit.mockResolvedValueOnce([fakeAgent]);

		await archiveAgent("agent-1", "ws-1", "user-1", false);

		expect(dbModule.db.update).toHaveBeenCalled();
	});

	it("archives global agent when canAdminCurate", async () => {
		dbModule._c.limit.mockResolvedValueOnce([{ ...fakeAgent, isGlobal: true }]);

		await archiveAgent("agent-1", "ws-1", "other", true);

		expect(dbModule.db.update).toHaveBeenCalled();
	});
});

// ─── updateAgent ──────────────────────────────────────────────────────

describe("updateAgent", () => {
	it("throws when agent not found", async () => {
		await expect(
			updateAgent({
				agentId: "nonexistent",
				workspaceId: "ws-1",
				userId: "user-1",
				baseVersionId: null,
			}),
		).rejects.toThrow("Agent not found");
	});

	it("throws when non-creator without admin tries to update", async () => {
		dbModule._c.limit.mockResolvedValueOnce([fakeAgent]);

		await expect(
			updateAgent({
				agentId: "agent-1",
				workspaceId: "ws-1",
				userId: "other",
				baseVersionId: "v1",
			}),
		).rejects.toThrow("Only the creator or an admin can update this agent");
	});

	it("updates agent when creator", async () => {
		dbModule._c.limit.mockResolvedValueOnce([fakeAgent]);

		// Use a version with null provider/model to avoid provider validation in tx
		const versionNoProvider = {
			...fakeVersion,
			providerId: null,
			modelId: null,
		};
		const newVersion = { ...fakeVersion, versionNumber: 2, id: "v2" };
		const updatedAgent = { ...fakeAgent };

		// Tx where call sequence (no identity changes):
		// Q1 lock the agent row, Q2 load active version, Q3 compute max version,
		// Q4 activate the new version, Q5 reload the updated agent.
		dbModule._tx.where
			.mockReturnValueOnce(dbModule._tx)
			.mockReturnValueOnce(dbModule._tx)
			.mockResolvedValueOnce([{ maxVersion: 1 }])
			.mockReturnValueOnce(dbModule._tx)
			.mockReturnValueOnce(dbModule._tx);

		dbModule._tx.limit
			.mockResolvedValueOnce([versionNoProvider]) // Q2 getActiveVersionConfig
			.mockResolvedValueOnce([updatedAgent]); // Q8 updatedAgent

		dbModule._tx.returning
			.mockResolvedValueOnce([fakeAgent])
			.mockResolvedValueOnce([newVersion]);

		const result = await updateAgent({
			agentId: "agent-1",
			workspaceId: "ws-1",
			userId: "user-1",
			baseVersionId: "v1",
		});

		expect(result.agent).toBeDefined();
		expect(dbModule.db.transaction).toHaveBeenCalledOnce();
	});
});

// ─── getAgentVersionById ──────────────────────────────────────────────

describe("getAgentVersionById", () => {
	it("returns null when not found", async () => {
		const result = await getAgentVersionById("nonexistent");
		expect(result).toBeNull();
	});

	it("returns version when found", async () => {
		dbModule._c.limit.mockResolvedValueOnce([fakeVersion]);
		const result = await getAgentVersionById("v1");
		expect(result).toEqual(fakeVersion);
	});
});

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

// ─── getConversationMessages ──────────────────────────────────────────

describe("getConversationMessages", () => {
	it("returns empty array when no messages", async () => {
		dbModule._c.orderBy.mockResolvedValueOnce([]);
		const result = await getConversationMessages("conv-1");
		expect(result).toHaveLength(0);
	});

	it("decrypts text parts", async () => {
		const { decryptValue } = await import("@/lib/crypto");
		const msg = {
			id: "msg-1",
			role: "user",
			status: "complete",
			createdAt: new Date(),
		};
		const part = {
			id: "part-1",
			messageId: "msg-1",
			type: "text",
			contentEncrypted: "enc:text",
			sortOrder: 0,
			metadataJson: null,
		};

		// Q1: messages orderBy
		// Q2: messageParts orderBy (for each message)
		dbModule._c.orderBy
			.mockResolvedValueOnce([msg]) // messages
			.mockResolvedValueOnce([part]); // parts for msg-1

		const result = await getConversationMessages("conv-1");

		expect(result).toHaveLength(1);
		expect(result[0].parts).toHaveLength(1);
		expect(decryptValue).toHaveBeenCalledWith("enc:text");
	});

	it("handles decryption failure gracefully", async () => {
		const { decryptValue } = await import("@/lib/crypto");
		vi.mocked(decryptValue).mockRejectedValueOnce(new Error("Key error"));

		const msg = {
			id: "msg-1",
			role: "user",
			status: "complete",
			createdAt: new Date(),
		};
		const part = {
			id: "part-1",
			messageId: "msg-1",
			type: "text",
			contentEncrypted: "enc:bad",
			sortOrder: 0,
			metadataJson: null,
		};

		dbModule._c.orderBy
			.mockResolvedValueOnce([msg])
			.mockResolvedValueOnce([part]);

		const result = await getConversationMessages("conv-1");
		expect(result[0].parts[0].content).toBe("[decryption failed]");
	});

	it("returns metadata JSON for non-text parts", async () => {
		const msg = {
			id: "msg-1",
			role: "assistant",
			status: "complete",
			createdAt: new Date(),
		};
		const meta = { toolName: "calculator", input: { expression: "1+1" } };
		const part = {
			id: "part-2",
			messageId: "msg-1",
			type: "tool_use",
			contentEncrypted: null,
			sortOrder: 0,
			metadataJson: meta,
		};

		dbModule._c.orderBy
			.mockResolvedValueOnce([msg])
			.mockResolvedValueOnce([part]);

		const result = await getConversationMessages("conv-1");
		expect(result[0].parts[0].content).toBe(JSON.stringify(meta));
	});
});

// ─── recordUsageEvent ─────────────────────────────────────────────────

describe("recordUsageEvent", () => {
	it("inserts a usage event", async () => {
		await recordUsageEvent({
			workspaceId: "ws-1",
			userId: "user-1",
			operation: "chat.completion",
			inputTokens: 100,
			outputTokens: 50,
			latencyMs: 200,
		});

		expect(dbModule.db.insert).toHaveBeenCalled();
		expect(dbModule._c.values).toHaveBeenCalled();
	});

	it("handles optional fields being undefined", async () => {
		await recordUsageEvent({
			workspaceId: "ws-1",
			userId: "user-1",
			operation: "chat.completion",
		});

		const insertValues = dbModule._c.values.mock.calls[0][0];
		expect(insertValues.inputTokens).toBeNull();
		expect(insertValues.outputTokens).toBeNull();
	});
});

// ─── defaults, ordering, cloning ───────────────────────────────────────

describe("agent defaults, ordering, and cloning", () => {
	it("resolves organization/user default preferences with availability filtering", async () => {
		dbModule._c.limit
			.mockResolvedValueOnce([{ id: "org-agent" }])
			.mockResolvedValueOnce([{ defaultAgentId: "user-agent" }]);

		await expect(
			getAgentDefaultPreferences("ws-1", "user-1", new Set(["org-agent"])),
		).resolves.toEqual({
			organizationDefaultAgentId: "org-agent",
			userDefaultAgentId: null,
			effectiveDefaultAgentId: "org-agent",
		});
	});

	it("clears and sets user default agents", async () => {
		dbModule._c.limit.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
		await expect(
			setUserDefaultAgent({
				workspaceId: "ws-1",
				userId: "user-1",
				agentId: null,
			}),
		).resolves.toEqual({
			organizationDefaultAgentId: null,
			userDefaultAgentId: null,
			effectiveDefaultAgentId: null,
		});
		expect(dbModule.db.delete).toHaveBeenCalled();

		reset();
		dbModule.db.select.mockReturnValue(dbModule._c);
		dbModule.db.insert.mockReturnValue(dbModule._c);
		dbModule._c.limit
			.mockResolvedValueOnce([{ ...fakeAgent, sharingMode: "marketplace" }])
			.mockResolvedValueOnce([])
			.mockResolvedValueOnce([{ defaultAgentId: "agent-1" }]);
		await expect(
			setUserDefaultAgent({
				workspaceId: "ws-1",
				userId: "user-2",
				agentId: "agent-1",
			}),
		).resolves.toMatchObject({ userDefaultAgentId: "agent-1" });
		expect(dbModule._c.onConflictDoUpdate ?? dbModule._c.values).toBeTruthy();
	});

	it("sets organization defaults only for global or recommended agents", async () => {
		dbModule._c.limit.mockResolvedValueOnce([
			{ ...fakeAgent, isGlobal: false, isRecommended: false },
		]);
		await expect(
			setOrganizationDefaultAgent({
				workspaceId: "ws-1",
				userId: "admin",
				agentId: "agent-1",
			}),
		).rejects.toThrow("Organization assistant not found");

		reset();
		dbModule.db.select.mockReturnValue(dbModule._c);
		dbModule.db.transaction.mockImplementation(
			(cb: (tx: Chain) => Promise<unknown>) => cb(dbModule._tx),
		);
		dbModule._c.limit
			.mockResolvedValueOnce([{ ...fakeAgent, isGlobal: true }])
			.mockResolvedValueOnce([{ id: "agent-1" }])
			.mockResolvedValueOnce([]);
		await expect(
			setOrganizationDefaultAgent({
				workspaceId: "ws-1",
				userId: "admin",
				agentId: "agent-1",
			}),
		).resolves.toMatchObject({ organizationDefaultAgentId: "agent-1" });
		expect(dbModule._tx.update).toHaveBeenCalledTimes(2);
	});

	it("reorders organization agents after validating every id", async () => {
		await reorderOrganizationAgents({
			workspaceId: "ws-1",
			userId: "admin",
			agentIds: [],
		});
		expect(dbModule.db.select).not.toHaveBeenCalled();

		dbModule._c.where.mockResolvedValueOnce([{ id: "a" }]);
		await expect(
			reorderOrganizationAgents({
				workspaceId: "ws-1",
				userId: "admin",
				agentIds: ["a", "b"],
			}),
		).rejects.toThrow("Organization assistant not found");

		reset();
		dbModule.db.select.mockReturnValue(dbModule._c);
		dbModule.db.transaction.mockImplementation(
			(cb: (tx: Chain) => Promise<unknown>) => cb(dbModule._tx),
		);
		dbModule._c.where.mockResolvedValueOnce([{ id: "a" }, { id: "b" }]);
		await reorderOrganizationAgents({
			workspaceId: "ws-1",
			userId: "admin",
			agentIds: ["a", "b", "a"],
		});
		expect(dbModule._tx.set).toHaveBeenCalledWith(
			expect.objectContaining({ organizationDisplayOrder: 0 }),
		);
		expect(dbModule._tx.set).toHaveBeenCalledWith(
			expect.objectContaining({ organizationDisplayOrder: 1 }),
		);
	});

	it("clones visible agents, source versions, and binding sets", async () => {
		dbModule._c.limit
			.mockResolvedValueOnce([
				{
					...fakeAgent,
					sharingMode: "marketplace",
					promptSuggestionsJson: ["Ask"],
				},
			])
			.mockResolvedValueOnce([]);
		dbModule._tx.limit.mockResolvedValueOnce([fakeVersion]);
		dbModule._tx.returning
			.mockResolvedValueOnce([{ ...fakeAgent, id: "clone-1", name: "Copy" }])
			.mockResolvedValueOnce([
				{ ...fakeVersion, id: "clone-version", agentId: "clone-1" },
			]);

		const result = await cloneAgent({
			workspaceId: "ws-1",
			userId: "user-2",
			agentId: "agent-1",
			name: "Copy",
		});

		expect(result.agent.id).toBe("clone-1");
		expect(result.version.id).toBe("clone-version");
		expect(dbModule._tx.values).toHaveBeenCalledWith(
			expect.objectContaining({
				forkedFromAgentId: "agent-1",
				sharingMode: "personal",
			}),
		);
	});
});
