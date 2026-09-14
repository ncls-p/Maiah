import { describe, expect, it } from "vitest";
import {
  serviceNowSecretKeys,
  serviceNowSecretsForAuth,
  validateServiceNowConnection,
} from "@/modules/tool-connections/service-now-auth";
const config = {
  instanceUrl: "https://example.service-now.com",
  authType: "basic",
};
describe("ServiceNow connection authentication", () => {
  it("offers only credentials for the chosen mode", () => {
    expect(serviceNowSecretKeys("basic")).toEqual(["username", "password"]);
    expect(serviceNowSecretKeys("oauth")).toEqual([
      "clientId",
      "clientSecret",
      "username",
      "password",
    ]);
    expect(serviceNowSecretKeys("api_key")).toEqual(["apiKey"]);
    expect(() => serviceNowSecretKeys("unknown")).toThrow();
  });
  it("discards inactive credentials and preserves password whitespace", () => {
    expect(
      serviceNowSecretsForAuth("basic", {
        username: "alice",
        password: " secret ",
        apiKey: "old-key",
      }),
    ).toEqual({ username: "alice", password: " secret " });
  });
  it("allows label edits to reuse secrets only with unchanged auth", () => {
    expect(() =>
      validateServiceNowConnection({
        config,
        hasExistingSecrets: true,
        previousAuthType: "basic",
      }),
    ).not.toThrow();
    expect(() =>
      validateServiceNowConnection({
        config: { ...config, authType: "api_key" },
        hasExistingSecrets: true,
        previousAuthType: "basic",
      }),
    ).toThrow("apiKey");
  });
  it("requires all active fields for creation and credential rotation", () => {
    expect(() =>
      validateServiceNowConnection({ config, secrets: { username: "alice" } }),
    ).toThrow("password");
    expect(() =>
      validateServiceNowConnection({
        config,
        hasExistingSecrets: true,
        secrets: { password: "new" },
      }),
    ).toThrow("username");
    expect(() =>
      validateServiceNowConnection({
        config,
        secrets: { username: "alice", password: "secret" },
      }),
    ).not.toThrow();
  });
  it("rejects non-HTTPS URLs and embedded credentials", () => {
    for (const instanceUrl of [
      "not a url",
      "http://example.com",
      "https://alice:secret@example.com",
    ]) {
      expect(() =>
        validateServiceNowConnection({
          config: { ...config, instanceUrl },
          secrets: { username: "alice", password: "secret" },
        }),
      ).toThrow();
    }
  });
});
