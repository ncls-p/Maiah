import { beforeEach, describe, expect, it, vi } from "vitest";

const hasPermission = vi.fn();

vi.mock("@/server/domain/services/authorization", () => ({
	authorization: {
		hasPermission,
	},
}));

describe("api key permissions", () => {
	beforeEach(() => {
		hasPermission.mockReset();
	});

	it("returns all when the user can manage all API keys", async () => {
		hasPermission.mockResolvedValueOnce(true).mockResolvedValueOnce(true);

		const { getApiKeyAccessScope } = await import(
			"../../src/modules/api-keys/permissions"
		);

		await expect(getApiKeyAccessScope("user-1", "workspace-1")).resolves.toBe(
			"all",
		);
		expect(hasPermission).toHaveBeenCalledWith(
			{ principalType: "user", principalId: "user-1" },
			"apiKeys.manage",
			"workspace",
			"workspace-1",
		);
	});

	it("returns own when only manage-own permission is granted", async () => {
		hasPermission.mockResolvedValueOnce(false).mockResolvedValueOnce(true);

		const { getApiKeyAccessScope } = await import(
			"../../src/modules/api-keys/permissions"
		);

		await expect(getApiKeyAccessScope("user-1", "workspace-1")).resolves.toBe(
			"own",
		);
	});

	it("returns null when no API key permission is granted", async () => {
		hasPermission.mockResolvedValueOnce(false).mockResolvedValueOnce(false);

		const { getApiKeyAccessScope } = await import(
			"../../src/modules/api-keys/permissions"
		);

		await expect(getApiKeyAccessScope("user-1", "workspace-1")).resolves.toBe(
			null,
		);
	});
});
