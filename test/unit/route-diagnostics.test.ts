import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { logger } from "@/lib/logger";
import {
  logRouteCompleted,
  requestIdFrom,
} from "@/lib/route-handler.route-handler-options";

vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
beforeEach(() => vi.clearAllMocks());

it("keeps polling errors and slow calls visible while reducing routine success noise", () => {
  const request = new NextRequest("https://maiah.test/api/companion");
  logRouteCompleted(
    request,
    "ref",
    Date.now(),
    "workspace",
    new Response(null, { status: 200 }),
  );
  expect(logger.debug).toHaveBeenCalledOnce();
  logRouteCompleted(
    request,
    "ref",
    Date.now() - 2000,
    "workspace",
    new Response(null, { status: 200 }),
  );
  expect(logger.info).toHaveBeenCalledOnce();
  logRouteCompleted(
    request,
    "ref",
    Date.now(),
    "workspace",
    new Response(null, { status: 401 }),
  );
  expect(logger.warn).toHaveBeenCalledOnce();
  const response = logRouteCompleted(
    request,
    "ref",
    Date.now(),
    "workspace",
    new Response(null, { status: 500 }),
  );
  expect(logger.error).toHaveBeenCalledOnce();
  expect(response.headers.get("x-request-id")).toBe("ref");
});

it("bounds caller supplied correlation IDs", () => {
  const req = new NextRequest("https://maiah.test/api/test", {
    headers: { "x-request-id": "x".repeat(1000) },
  });
  expect(requestIdFrom(req)).toMatch(/^[0-9a-f-]{36}$/);
});
