import { describe, expect, it } from "vitest";

describe("rate-limit", async () => {
	const { rateLimitExceededResponse } = await import("@/lib/rate-limit");

	describe("rateLimitExceededResponse", () => {
		it("returns 429 status", () => {
			const res = rateLimitExceededResponse(1700000000, 0);
			expect(res.status).toBe(429);
		});

		it("includes Retry-After header as seconds until reset", () => {
			const reset = Math.floor(Date.now() / 1000) + 60;
			const res = rateLimitExceededResponse(reset, 0);
			const retryAfter = Number(res.headers.get("Retry-After"));
			expect(retryAfter).toBeGreaterThan(0);
			expect(retryAfter).toBeLessThanOrEqual(60);
			expect(res.headers.get("X-RateLimit-Reset")).toBe(String(reset));
		});

		it("includes rate limit headers", () => {
			const res = rateLimitExceededResponse(1700000000, 0, 10);
			expect(res.headers.get("X-RateLimit-Limit")).toBe("10");
			expect(res.headers.get("X-RateLimit-Remaining")).toBe("0");
		});

		it("returns JSON error body", () => {
			const res = rateLimitExceededResponse(1700000000, 0);
			expect(res.headers.get("content-type")).toContain("application/json");
		});
	});

	describe("checkRateLimit fail-open behavior", () => {
		it("is exported and callable", async () => {
			const { checkRateLimit } = await import("@/lib/rate-limit");
			expect(typeof checkRateLimit).toBe("function");
		});
	});

	describe("withRateLimit wrapper", () => {
		it("is exported and callable", async () => {
			const { withRateLimit } = await import("@/lib/rate-limit");
			expect(typeof withRateLimit).toBe("function");
		});
	});
});
