import { describe, expect, it } from "vitest";
import {
  microsoftConfigSchema,
  isTrustedMicrosoftSettingsOrigin,
  microsoftIdentity,
} from "@/modules/auth/microsoft/config";
const config = {
  enabled: true,
  clientId: crypto.randomUUID(),
  tenantId: crypto.randomUUID(),
  loginOrigin: "https://maiah.deodis.com",
  emailDomains: ["deodis.com"],
};
describe("Microsoft SSO identity boundaries", () => {
  it("allows only explicit origins and single-tenant registrations", () => {
    expect(microsoftConfigSchema.safeParse(config).success).toBe(true);
    for (const tenantId of ["common", "organizations", "consumers", "../other"])
      expect(
        microsoftConfigSchema.safeParse({ ...config, tenantId }).success,
      ).toBe(false);
    for (const loginOrigin of [
      "http://public.example",
      "https://maiah.deodis.com/other",
      "https://user:pass@maiah.deodis.com",
      "https://maiah.deodis.com/",
    ])
      expect(
        microsoftConfigSchema.safeParse({ ...config, loginOrigin }).success,
      ).toBe(false);
  });
  it("binds account identity to tenant and object ID, not mutable email", () => {
    const oid = crypto.randomUUID();
    expect(
      microsoftIdentity(
        { tid: config.tenantId, oid, email: "USER@DEODIS.COM" },
        config,
      ),
    ).toEqual({
      email: "user@deodis.com",
      accountId: `${config.tenantId}:${oid}`,
    });
    for (const email of [
      "user@sub.deodis.com",
      "user@deodis.com.attacker.test",
      "user@other.com",
      "invalid",
      undefined,
    ])
      expect(
        microsoftIdentity({ tid: config.tenantId, oid, email }, config),
      ).toBeNull();
    expect(
      microsoftIdentity(
        { tid: crypto.randomUUID(), oid, email: "user@deodis.com" },
        config,
      ),
    ).toBeNull();
    expect(
      microsoftIdentity(
        { tid: config.tenantId, oid: "", email: "user@deodis.com" },
        config,
      ),
    ).toBeNull();
  });
});

describe("Microsoft settings write origins", () => {
  const trusted = ["https://maiah.deodis.com", " https://maiah.shiftify.eco "];
  it("accepts both explicitly configured public origins behind the proxy", () => {
    expect(
      isTrustedMicrosoftSettingsOrigin("https://maiah.deodis.com", trusted),
    ).toBe(true);
    expect(
      isTrustedMicrosoftSettingsOrigin("https://maiah.shiftify.eco", trusted),
    ).toBe(true);
  });
  it("rejects missing, opaque, internal and untrusted origins", () => {
    for (const origin of [
      null,
      "null",
      "",
      "http://localhost:3000",
      "http://maiah.deodis.com",
      "https://maiah.deodis.com.evil.test",
      "https://evil.test",
      "https://maiah.deodis.com/path",
      "https://user@maiah.deodis.com",
    ]) {
      expect(isTrustedMicrosoftSettingsOrigin(origin, trusted)).toBe(false);
    }
  });
});
