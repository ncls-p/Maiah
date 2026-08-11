import { describe, expect, it } from "vitest";

process.env.SANDBOX_EGRESS_PROXY_VALIDATE_ONLY = "true";

const { isBlockedPackageHost, isPublicAddress, resolvePublicTarget } =
  await import("../../scripts/sandbox-runner-egress-proxy.mjs");

describe("sandbox egress proxy policy", () => {
  it("rejects local and container network destinations", async () => {
    for (const address of [
      "127.0.0.1",
      "10.0.0.1",
      "172.18.0.1",
      "192.168.1.1",
      "169.254.169.254",
      "192.0.2.1",
      "198.51.100.1",
      "203.0.113.1",
      "::1",
      "fd00::1",
      "2001:db8::1",
    ]) {
      expect(isPublicAddress(address)).toBe(false);
    }
    await expect(resolvePublicTarget("localhost")).rejects.toThrow(
      "Local network",
    );
  });

  it("allows public addresses but blocks package registries", () => {
    expect(isPublicAddress("1.1.1.1")).toBe(true);
    expect(isPublicAddress("2606:4700:4700::1111")).toBe(true);
    expect(isBlockedPackageHost("registry.npmjs.org")).toBe(true);
    expect(isBlockedPackageHost("files.pythonhosted.org")).toBe(true);
    expect(isBlockedPackageHost("example.com")).toBe(false);
  });
});
