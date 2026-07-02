import { describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
	headers: vi.fn().mockResolvedValue(new Headers({ "cookie": "session=test" })),
}));

// Use vi.doMock to mock auth after the module is loaded
vi.mock("@/lib/auth", async () => {
	const actual = await vi.importActual<typeof import("@/lib/auth")>("@/lib/auth");
	const mockAuth = {
		...(actual?.auth ?? {}),
		api: {
			getSession: vi.fn().mockResolvedValue({
				user: { id: "u1", name: "test", email: "t@t.com", emailVerified: false, image: null, banned: null, createdAt: new Date(), updatedAt: new Date() },
				session: { id: "s1", userId: "u1", expiresAt: new Date(), token: "t", createdAt: new Date(), updatedAt: new Date() },
			}),
		},
	};
	return {
		...actual,
		auth: mockAuth,
	};
});
import { headers } from "next/headers";

describe("getSession", () => {
	it("calls headers() and auth.api.getSession", async () => {
		const { getSession } = await import("@/modules/auth/session");
		const result = await getSession();

		expect(headers).toHaveBeenCalled();
		expect(result).toBeDefined();
		expect(result).not.toBeNull();
	});
});