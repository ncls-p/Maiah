import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/domain/services/audit", () => ({
	audit: { emit: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock("@/lib/logger", () => ({
	logHandledError: vi.fn(),
}));

type Chain = {
	select: ReturnType<typeof vi.fn>;
	insert: ReturnType<typeof vi.fn>;
	update: ReturnType<typeof vi.fn>;
	from: ReturnType<typeof vi.fn>;
	where: ReturnType<typeof vi.fn>;
	limit: ReturnType<typeof vi.fn>;
	values: ReturnType<typeof vi.fn>;
	set: ReturnType<typeof vi.fn>;
	returning: ReturnType<typeof vi.fn>;
};

function makeChain(): Chain {
	const c = {} as Chain;
	for (const key of [
		"select",
		"insert",
		"update",
		"from",
		"where",
		"values",
		"set",
	] as const) {
		c[key] = vi.fn().mockReturnThis();
	}
	c.limit = vi.fn().mockResolvedValue([]);
	c.returning = vi.fn().mockResolvedValue([]);
	return c;
}

type DbModule = {
	db: {
		select: ReturnType<typeof vi.fn>;
		insert: ReturnType<typeof vi.fn>;
		update: ReturnType<typeof vi.fn>;
		transaction: ReturnType<typeof vi.fn>;
	};
	_c: Chain;
	_tx: Chain;
};

vi.mock("@/server/infrastructure/db", () => {
	const chain = makeChain();
	const tx = makeChain();
	return {
		db: {
			select: vi.fn(),
			insert: vi.fn(),
			update: vi.fn(),
			transaction: vi.fn(),
		},
		_c: chain,
		_tx: tx,
	};
});

import { logHandledError } from "@/lib/logger";
import * as _dbModule from "@/server/infrastructure/db";
import {
	findExistingDraft,
	upsertMarketplaceDraft,
} from "@/modules/marketplace/draft-helpers";

const dbModule = _dbModule as unknown as DbModule;

function resetChain(chain: Chain) {
	for (const key of [
		"select",
		"insert",
		"update",
		"from",
		"where",
		"values",
		"set",
	] as const) {
		chain[key].mockReset().mockReturnThis();
	}
	chain.limit.mockReset().mockResolvedValue([]);
	chain.returning.mockReset().mockResolvedValue([]);
}

beforeEach(() => {
	vi.clearAllMocks();
	resetChain(dbModule._c);
	resetChain(dbModule._tx);
	dbModule.db.select.mockReset().mockReturnValue(dbModule._c);
	dbModule.db.insert.mockReset().mockReturnValue(dbModule._c);
	dbModule.db.update.mockReset().mockReturnValue(dbModule._c);
	dbModule.db.transaction
		.mockReset()
		.mockImplementation((cb: (tx: Chain) => Promise<unknown>) =>
			cb(dbModule._tx),
		);
});

const baseInput = {
	workspaceId: "ws-1",
	userId: "user-1",
	type: "skill" as const,
	sourceResourceType: "skill" as const,
	sourceResourceId: "skill-1",
	version: "1.0.0",
	name: "Research Skill",
	description: "Research",
	visibility: "public" as const,
	tags: ["research"],
	manifest: {
		type: "skill" as const,
		name: "Research Skill",
		skill: { markdownFiles: [] as Array<{ path: string; content: string }> },
	},
	metadata: { source: "test" },
};

describe("findExistingDraft", () => {
	it("returns a matching draft or null", async () => {
		dbModule._c.limit.mockResolvedValueOnce([{ id: "item-1" }]);
		await expect(
			findExistingDraft("skill", "skill-1", "user-1"),
		).resolves.toEqual({ id: "item-1" });

		resetChain(dbModule._c);
		dbModule.db.select.mockReturnValue(dbModule._c);
		dbModule._c.limit.mockResolvedValueOnce([]);
		await expect(
			findExistingDraft("skill", "skill-1", "user-1"),
		).resolves.toBeNull();
	});
});

describe("upsertMarketplaceDraft", () => {
	it("creates a new draft item and initial version inside a transaction", async () => {
		dbModule._c.limit.mockResolvedValueOnce([]);
		dbModule._tx.returning
			.mockResolvedValueOnce([{ id: "item-1", name: "Research Skill" }])
			.mockResolvedValueOnce([{ id: "version-1", version: "1.0.0" }]);

		const result = await upsertMarketplaceDraft(baseInput);

		expect(result).toEqual({
			item: { id: "item-1", name: "Research Skill" },
			version: { id: "version-1", version: "1.0.0" },
			reused: false,
		});
		expect(dbModule.db.transaction).toHaveBeenCalled();
		expect(dbModule._tx.values).toHaveBeenCalledWith(
			expect.objectContaining({
				slug: expect.stringMatching(/^research-skill-/),
				status: "draft",
				pricingModel: "free",
			}),
		);
	});

	it("updates an existing draft and can publish it", async () => {
		dbModule._c.limit.mockResolvedValueOnce([
			{
				id: "item-1",
				visibility: "private",
				tagsJson: ["old"],
				status: "draft",
				publishedAt: null,
			},
		]);
		dbModule._c.returning
			.mockResolvedValueOnce([{ id: "version-2", version: "1.0.1" }])
			.mockResolvedValueOnce([{ id: "item-1", status: "published" }]);
		const publishedAt = new Date("2025-01-01T00:00:00Z");

		const result = await upsertMarketplaceDraft({
			...baseInput,
			version: "1.0.1",
			status: "published",
			publishedAt,
		});

		expect(result.reused).toBe(true);
		expect(result.item).toEqual({ id: "item-1", status: "published" });
		expect(dbModule._c.set).toHaveBeenCalledWith(
			expect.objectContaining({
				status: "published",
				publishedAt,
				latestVersionId: "version-2",
			}),
		);
	});

	it("logs and rethrows failed upserts", async () => {
		dbModule._c.limit.mockRejectedValueOnce(new Error("db down"));

		await expect(upsertMarketplaceDraft(baseInput)).rejects.toThrow("db down");
		expect(logHandledError).toHaveBeenCalledWith(
			"Failed to upsert marketplace draft",
			{},
			expect.any(Error),
		);
	});
});
