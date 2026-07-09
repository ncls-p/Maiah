import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
	const selectChain = {
		from: vi.fn(),
		innerJoin: vi.fn(),
		where: vi.fn(),
		orderBy: vi.fn(),
		limit: vi.fn(),
	};
	for (const method of [
		selectChain.from,
		selectChain.innerJoin,
		selectChain.where,
		selectChain.orderBy,
	]) {
		method.mockReturnValue(selectChain);
	}
	return {
		selectChain,
		dbSelect: vi.fn(() => selectChain),
		claim: vi.fn(),
		reject: vi.fn(),
		completeSuccess: vi.fn(),
		completeFailure: vi.fn(),
		execute: vi.fn(),
		audit: vi.fn(),
		hasPermission: vi.fn(),
		requirePermission: vi.fn(),
	};
});

vi.mock("@/server/infrastructure/db", () => ({
	db: { select: mocks.dbSelect },
}));

vi.mock("@/modules/auth/session", () => ({
	getSession: vi.fn(async () => ({ user: { id: "user-1" } })),
}));

vi.mock("@/modules/tool/invocation-approval", () => ({
	claimToolInvocationForExecution: mocks.claim,
	rejectPendingToolInvocation: mocks.reject,
	completeToolInvocationSuccess: mocks.completeSuccess,
	completeToolInvocationFailure: mocks.completeFailure,
}));

vi.mock("@/modules/tool/builtin-tools", () => ({
	getBuiltInTool: vi.fn(() => ({
		name: "fetch_url",
		execute: mocks.execute,
	})),
}));

vi.mock("@/server/domain/services/authorization", () => ({
	authorization: { hasPermission: mocks.hasPermission },
}));

vi.mock("@/server/domain/services/audit", () => ({
	audit: { emit: mocks.audit },
}));

vi.mock("@/lib/crypto", () => ({
	decryptValue: vi.fn(
		async () => '{"apiKey":"hidden","maxOutputTokens":256}',
	),
	encryptValue: vi.fn(async () => "encrypted-output"),
}));

vi.mock("@/lib/logger", () => ({
	logger: { info: vi.fn(), warn: vi.fn() },
	logHandledError: vi.fn(),
}));

vi.mock("@/lib/route-handler", () => ({
	requireWorkspacePermissionAsync: mocks.requirePermission,
	handleRoute: async (
		request: Request,
		handler: (context: {
			session: { user: { id: string } };
			request: Request;
		}) => Promise<Response>,
	) =>
		handler({
			session: { user: { id: "user-1" } },
			request,
		}),
}));

import { POST as approveInvocation } from "@/app/api/workspace/tool-invocations/[invocationId]/approve/route";
import { POST as rejectInvocation } from "@/app/api/workspace/tool-invocations/[invocationId]/reject/route";
import { GET as listInvocations } from "@/app/api/workspace/tool-invocations/route";
import { NextRequest } from "next/server";

const invocation = {
	id: "11111111-1111-4111-8111-111111111111",
	workspaceId: "22222222-2222-4222-8222-222222222222",
	conversationId: "33333333-3333-4333-8333-333333333333",
	messageId: "44444444-4444-4444-8444-444444444444",
	toolSource: "builtin",
	toolId: "55555555-5555-4555-8555-555555555555",
	toolName: "fetch_url",
	riskLevel: "high",
	inputJsonEncrypted: "encrypted-input",
	outputJsonEncrypted: null,
	status: "awaiting_approval",
	latencyMs: null,
	errorMessage: null,
	approvedByUserId: null,
	createdAt: new Date(),
	completedAt: null,
};

function request() {
	return new Request(
		`http://localhost/api/workspace/tool-invocations/${invocation.id}`,
		{ method: "POST" },
	);
}

const params = { params: Promise.resolve({ invocationId: invocation.id }) };

beforeEach(() => {
	vi.clearAllMocks();
	for (const method of [
		mocks.selectChain.from,
		mocks.selectChain.innerJoin,
		mocks.selectChain.where,
		mocks.selectChain.orderBy,
	]) {
		method.mockReturnValue(mocks.selectChain);
	}
	mocks.selectChain.limit.mockResolvedValue([
		{ invocation, conversation: { id: invocation.conversationId } },
	]);
	mocks.dbSelect.mockReturnValue(mocks.selectChain);
	mocks.hasPermission.mockResolvedValue(true);
	mocks.requirePermission.mockResolvedValue(null);
	mocks.execute.mockResolvedValue({ value: "private result" });
	mocks.completeSuccess.mockResolvedValue(true);
	mocks.completeFailure.mockResolvedValue(true);
	mocks.audit.mockResolvedValue(undefined);
});

describe("tool invocation approval routes", () => {
	it("does not execute again when another request already claimed approval", async () => {
		mocks.claim.mockResolvedValue({
			kind: "unchanged",
			invocation: { ...invocation, status: "running" },
		});

		const response = await approveInvocation(request(), params);

		expect(response.status).toBe(202);
		await expect(response.json()).resolves.toEqual({
			ok: true,
			status: "running",
			alreadyResolved: true,
		});
		expect(mocks.execute).not.toHaveBeenCalled();
		expect(mocks.completeSuccess).not.toHaveBeenCalled();
	});

	it("executes exactly once after winning the claim and returns no raw output", async () => {
		mocks.claim.mockResolvedValue({
			kind: "claimed",
			invocation: { ...invocation, status: "running" },
		});

		const response = await approveInvocation(request(), params);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({
			ok: true,
			status: "success",
		});
		expect(mocks.execute).toHaveBeenCalledOnce();
		expect(mocks.completeSuccess).toHaveBeenCalledOnce();
	});

	it("returns repeated rejection as an idempotent success", async () => {
		mocks.reject.mockResolvedValue({
			kind: "unchanged",
			invocation: { ...invocation, status: "rejected" },
		});

		const response = await rejectInvocation(request() as never, params);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({
			ok: true,
			status: "rejected",
			alreadyResolved: true,
		});
		expect(mocks.audit).not.toHaveBeenCalled();
	});

	it("returns only the safe display projection from the list endpoint", async () => {
		mocks.selectChain.limit.mockResolvedValueOnce([
			{
				...invocation,
				inputJsonEncrypted: "encrypted-input",
			},
		]);
		const response = await listInvocations(
			new NextRequest(
				`http://localhost/api/workspace/tool-invocations?workspaceId=${invocation.workspaceId}`,
			),
		);

		expect(response.status).toBe(200);
		const [payload] = (await response.json()) as Array<{
			input: Record<string, unknown>;
		}>;
		expect(payload.input).toEqual({
			apiKey: "[REDACTED]",
			maxOutputTokens: 256,
		});
	});
});
