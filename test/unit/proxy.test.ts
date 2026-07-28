import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { getConfiguredHttpsRedirect } from "@/lib/public-https";

describe("public HTTPS origin", () => {
  it("redirects the configured public host from HTTP to HTTPS", () => {
    const request = new NextRequest(
      "http://app:3000/en/auth/signin?next=%2Fen%2Fchat",
      {
        headers: {
          host: "app:3000",
          "x-forwarded-host": "maiah-pr-12.shiftify.eco",
          "x-forwarded-proto": "http",
        },
      },
    );

    const redirect = getConfiguredHttpsRedirect(
      request,
      "https://maiah-pr-12.shiftify.eco",
    );

    expect(redirect?.toString()).toBe(
      "https://maiah-pr-12.shiftify.eco/en/auth/signin?next=%2Fen%2Fchat",
    );
  });

  it("does not redirect HTTPS requests or an unrelated host", () => {
    const secureRequest = new NextRequest(
      "http://maiah-pr-12.shiftify.eco/en/auth/signin",
      {
        headers: {
          "x-forwarded-host": "maiah-pr-12.shiftify.eco",
          "x-forwarded-proto": "https",
        },
      },
    );
    const unrelatedHostRequest = new NextRequest(
      "http://untrusted.example/en/auth/signin",
      {
        headers: {
          "x-forwarded-host": "untrusted.example",
          "x-forwarded-proto": "http",
        },
      },
    );

    expect(
      getConfiguredHttpsRedirect(
        secureRequest,
        "https://maiah-pr-12.shiftify.eco",
      ),
    ).toBeNull();
    expect(
      getConfiguredHttpsRedirect(
        unrelatedHostRequest,
        "https://maiah-pr-12.shiftify.eco",
      ),
    ).toBeNull();
  });

  it("keeps local HTTP deployments available", () => {
    const request = new NextRequest("http://localhost:3300/en/auth/signin");

    expect(
      getConfiguredHttpsRedirect(request, "http://localhost:3300"),
    ).toBeNull();
  });

  it("publishes Coolify services through the HTTPS public origin", () => {
    const workflow = readFileSync(".github/workflows/coolify.yml", "utf8");

    expect(workflow).toContain(
      'public_url="https://${public_host}"\n            service_url="https://${public_host}:3000"',
    );
    expect(workflow).toContain('BETTER_AUTH_URL="${AI_HUB_PUBLIC_URL}"');
    expect(workflow).toContain(
      'BETTER_AUTH_TRUSTED_ORIGINS="${AI_HUB_PUBLIC_URL}"',
    );
  });
});
