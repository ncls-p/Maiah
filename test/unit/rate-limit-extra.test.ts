import { beforeEach, describe, expect, it, vi } from "vitest";

const cacheMock = vi.hoisted(() => ({ incr: vi.fn() }));

vi.mock("@/server/infrastructure/cache", () => ({ cache: cacheMock }));

describe("rate limiting helpers", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2024-01-01T00:00:00.000Z"));
	});

	it("checks forwarded IPs, custom keys, fail-open behavior, and response headers", async () => {
		const mod = await import("@/lib/rate-limit");
		cacheMock.incr.mockResolvedValueOnce(2);
		const allowed = await mod.checkRateLimit(
			new Request("https://app.test", {
				headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
			}),
			{ limit: 3, windowSeconds: 10 },
		);
		expect(allowed).toEqual({ allowed: true, remaining: 1, reset: 1704067210 });
		expect(cacheMock.incr).toHaveBeenCalledWith("ratelimit:1.2.3.4", 10);

		cacheMock.incr.mockResolvedValueOnce(5);
		await expect(
			mod.checkRateLimit(new Request("https://app.test"), {
				key: "custom",
				limit: 3,
			}),
		).resolves.toMatchObject({ allowed: false, remaining: 0 });
		expect(cacheMock.incr).toHaveBeenLastCalledWith("ratelimit:custom", 60);

		cacheMock.incr.mockRejectedValueOnce(new Error("redis down"));
		await expect(
			mod.checkRateLimit(
				new Request("https://app.test", {
					headers: { "x-real-ip": "9.9.9.9" },
				}),
				{ limit: 7, windowSeconds: 5 },
			),
		).resolves.toEqual({ allowed: true, remaining: 7, reset: 1704067205 });

		const exceeded = mod.rateLimitExceededResponse(1704067203, 0, 3);
		expect(exceeded.status).toBe(429);
		expect(exceeded.headers.get("Retry-After")).toBe("3");
		await expect(exceeded.json()).resolves.toMatchObject({
			error: "Rate limit exceeded",
			retryAfter: 3,
		});
	});

	it("wraps handlers and appends rate-limit headers", async () => {
		const mod = await import("@/lib/rate-limit");
		cacheMock.incr.mockResolvedValueOnce(1);
		const handler = vi.fn(
			async () =>
				new Response("ok", { status: 202, headers: { "x-app": "yes" } }),
		) as never;
		const wrapped = mod.withRateLimit(handler, { limit: 2, windowSeconds: 20 });
		const response = await wrapped(new Request("https://app.test"));
		expect(response.status).toBe(202);
		expect(response.headers.get("x-app")).toBe("yes");
		expect(response.headers.get("X-RateLimit-Remaining")).toBe("1");
		await expect(response.text()).resolves.toBe("ok");

		cacheMock.incr.mockResolvedValueOnce(3);
		const blocked = await wrapped(new Request("https://app.test"));
		expect(blocked.status).toBe(429);
		expect(handler).toHaveBeenCalledTimes(1);
	});
});
