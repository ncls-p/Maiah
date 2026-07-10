import { getTableColumns } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
	agentDelegationBindings,
	agentRuns,
	agentRunSteps,
	agentVersions,
	agents,
	workspaceTokenReservations,
} from "@/server/infrastructure/db/schema";

describe("orchestrator persistence schema", () => {
	it("versions agent kind and orchestration policy independently", () => {
		expect(getTableColumns(agents).kind).toBeDefined();
		expect(getTableColumns(agentVersions).orchestrationPolicyJson).toBeDefined();
		expect(getTableColumns(agentDelegationBindings).childAgentVersionId).toBeDefined();
	});

	it("persists durable run trees and safe trace steps", () => {
		const runColumns = getTableColumns(agentRuns);
		expect(runColumns.rootRunId).toBeDefined();
		expect(runColumns.parentRunId).toBeDefined();
		expect(runColumns.idempotencyKey).toBeDefined();
		expect(runColumns.deadlineAt).toBeDefined();
		expect(runColumns.leaseExpiresAt).toBeDefined();
		expect(runColumns.cancelRequestedAt).toBeDefined();
		expect(getTableColumns(agentRunSteps).inputPreviewJson).toBeDefined();
	});

	it("tracks token reservations separately from settled usage", () => {
		const columns = getTableColumns(workspaceTokenReservations);
		expect(columns.reservedTokens).toBeDefined();
		expect(columns.actualTokens).toBeDefined();
		expect(columns.expiresAt).toBeDefined();
	});
});
