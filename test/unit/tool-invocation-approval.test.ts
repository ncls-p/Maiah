import { beforeEach, describe, expect, it, vi } from "vitest";

type Chain = {
	from: ReturnType<typeof vi.fn>;
	set: ReturnType<typeof vi.fn>;
	where: ReturnType<typeof vi.fn>;
	limit: ReturnType<typeof vi.fn>;
	returning: ReturnType<typeof vi.fn>;
};

const dbMock = vi.hoisted(() => {
	const chain: Chain = {
		from: vi.fn(),
		set: vi.fn(),
		where: vi.fn(),
		limit: vi.fn(),
		returning: vi.fn(),
	};
	for (const method of [chain.from, chain.set, chain.where]) {
		method.mockReturnValue(chain);
	}
	chain.limit.mockResolvedValue([]);
	chain.returning.mockResolvedValue([]);
	return {
		chain,
		db: {
			select: vi.fn(() => chain),
			update: vi.fn(() => chain),
		},
	};
});

vi.mock("@/server/infrastructure/db", () => ({ db: dbMock.db }));

import {
	claimToolInvocationForExecution,
	completeToolInvocationFailure,
	completeToolInvocationSuccess,
	rejectPendingToolInvocation,
} from "@/modules/tool/invocation-approval";

const awaitingInvocation = {
	id: "invocation-1",
	status: "awaiting_approval",
	toolName: "fetch_url",
};

beforeEach(() => {
	vi.clearAllMocks();
	for (const method of [
		dbMock.chain.from,
		dbMock.chain.set,
		dbMock.chain.where,
	]) {
		method.mockReturnValue(dbMock.chain);
	}
	dbMock.chain.limit.mockResolvedValue([]);
	dbMock.chain.returning.mockResolvedValue([]);
	dbMock.db.select.mockReturnValue(dbMock.chain);
	dbMock.db.update.mockReturnValue(dbMock.chain);
});

describe("tool invocation approval transitions", () => {
	it("allows only one approver to claim an awaiting invocation", async () => {
		dbMock.chain.returning
			.mockResolvedValueOnce([{ ...awaitingInvocation, status: "running" }])
			.mockResolvedValueOnce([]);
		dbMock.chain.limit.mockResolvedValueOnce([
			{ ...awaitingInvocation, status: "running" },
		]);

		await expect(
			claimToolInvocationForExecution("invocation-1", "user-1"),
		).resolves.toMatchObject({ kind: "claimed" });
		await expect(
			claimToolInvocationForExecution("invocation-1", "user-1"),
		).resolves.toMatchObject({
			kind: "unchanged",
			invocation: { status: "running" },
		});
		expect(dbMock.db.select).toHaveBeenCalledOnce();
	});

	it("makes repeated rejection idempotently observable", async () => {
		dbMock.chain.returning.mockResolvedValueOnce([]);
		dbMock.chain.limit.mockResolvedValueOnce([
			{ ...awaitingInvocation, status: "rejected" },
		]);

		await expect(
			rejectPendingToolInvocation("invocation-1", "user-1"),
		).resolves.toMatchObject({
			kind: "unchanged",
			invocation: { status: "rejected" },
		});
		expect(dbMock.chain.set).toHaveBeenCalledWith(
			expect.objectContaining({ status: "rejected" }),
		);
	});

	it("finalizes only a claimed running invocation", async () => {
		dbMock.chain.returning
			.mockResolvedValueOnce([{ id: "invocation-1" }])
			.mockResolvedValueOnce([]);

		await expect(
			completeToolInvocationSuccess("invocation-1", {
				encryptedOutput: "encrypted",
				latencyMs: 12,
			}),
		).resolves.toBe(true);
		await expect(
			completeToolInvocationFailure("invocation-1", {
				errorMessage: "failed",
				latencyMs: 15,
			}),
		).resolves.toBe(false);
		expect(dbMock.chain.set).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({ status: "success", latencyMs: 12 }),
		);
		expect(dbMock.chain.set).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({ status: "failed", latencyMs: 15 }),
		);
	});
});
