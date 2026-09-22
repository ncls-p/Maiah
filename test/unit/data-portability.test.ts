import { describe, expect, it } from "vitest";
import {
  digest,
  openSnapshot,
  sealSnapshot,
  validateSnapshot,
  type Snapshot,
} from "@/modules/data-portability/archive";
import {
  emptyDataset,
  schemaFingerprint,
  tableNames,
  tables,
  assertRegistryCoverage,
} from "@/modules/data-portability/registry";
import { keyedSecretCodec } from "@/modules/data-portability/context";
import { transformSecrets } from "@/modules/data-portability/secrets";
import { selectOrganization } from "@/modules/data-portability/scope";
import {
  signConfirmation,
  verifyConfirmation,
} from "@/modules/data-portability/confirmation";
import { pauseRestoredData } from "@/modules/data-portability/restore-policy";

const password = "a-test-passphrase-at-least-16";
const org = "10000000-0000-4000-8000-000000000001";
const workspace = "20000000-0000-4000-8000-000000000001";
function snapshot(): Snapshot {
  return {
    format: "maiah.data",
    version: 1,
    schema: schemaFingerprint,
    createdAt: new Date().toISOString(),
    scope: { type: "instance" },
    prefixes: { attachments: "chat-attachments", code: "code-workspaces" },
    data: emptyDataset(),
    objects: [
      {
        key: "test/file",
        contentType: "text/plain",
        bytes: Buffer.from("sensitive content").toString("base64"),
        sha256: digest("sensitive content"),
      },
    ],
  };
}
describe("encrypted data portability", () => {
  it("covers every application table, including auth, tokens, usage and connectors", () => {
    expect(() => assertRegistryCoverage()).not.toThrow();
    expect(tables).toHaveLength(82);
    expect(tableNames).toEqual(
      expect.arrayContaining([
        "account",
        "mcp_oauth_credentials",
        "usage_events",
        "usage_limit_charges",
        "tool_connections",
        "agent_runs",
      ]),
    );
  });
  it("round trips an authenticated encrypted archive without readable content", async () => {
    const input = snapshot();
    const bytes = await sealSnapshot(input, password);
    expect(bytes.includes(Buffer.from("sensitive content"))).toBe(false);
    expect(bytes.includes(Buffer.from("maiah.data"))).toBe(false);
    expect(await openSnapshot(bytes, password)).toEqual(input);
  });
  it("rejects wrong passphrases, tampering, truncation and short passphrases", async () => {
    const bytes = await sealSnapshot(snapshot(), password);
    await expect(openSnapshot(bytes, "wrong-but-long-enough")).rejects.toThrow(
      /passphrase/,
    );
    bytes[bytes.length - 1] ^= 1;
    await expect(openSnapshot(bytes, password)).rejects.toThrow(/damaged/);
    await expect(openSnapshot(bytes.subarray(0, 30), password)).rejects.toThrow(
      /Invalid/,
    );
    await expect(sealSnapshot(snapshot(), "short")).rejects.toThrow(/16/);
  });
  it("rejects schema drift, missing tables, extra columns, damaged and unsafe objects", () => {
    expect(() =>
      validateSnapshot({ ...snapshot(), schema: "wrong" }),
    ).toThrow();
    const missing = snapshot();
    delete (missing.data as Record<string, unknown>).account;
    expect(() => validateSnapshot(missing)).toThrow(/inventory/);
    const columns = snapshot();
    columns.data.user.push({ id: "only" });
    expect(() => validateSnapshot(columns)).toThrow(/columns/);
    for (const key of [
      "../secret",
      "/absolute",
      "a/../b",
      "a\\b",
      "a\u0000b",
    ]) {
      const input = snapshot();
      input.objects[0].key = key;
      expect(() => validateSnapshot(input)).toThrow(/Unsafe/);
    }
    const damaged = snapshot();
    damaged.objects[0].sha256 = "0".repeat(64);
    expect(() => validateSnapshot(damaged)).toThrow(/integrity/);
    const duplicate = snapshot();
    duplicate.objects.push(duplicate.objects[0]);
    expect(() => validateSnapshot(duplicate)).toThrow(/duplicate/);
  });
  it("rewraps nested secrets with a distinct destination key and keeps the master key out of the archive", async () => {
    const a = keyedSecretCodec("11".repeat(32), "source"),
      b = keyedSecretCodec("22".repeat(32), "target");
    const original = await a.encrypt("provider-token");
    const portable = await transformSecrets(
      { nested: [original] },
      "export",
      a,
    );
    expect(JSON.stringify(portable)).not.toContain("11".repeat(32));
    const imported = (await transformSecrets(portable, "import", b)) as {
      nested: string[];
    };
    expect(await b.decrypt(imported.nested[0])).toBe("provider-token");
    await expect(a.decrypt(imported.nested[0])).rejects.toThrow();
  });
  it("binds preview confirmation to the admin, digest and expiry", () => {
    const token = signConfirmation("signing-secret", "admin-a", "digest-a");
    expect(
      verifyConfirmation("signing-secret", "admin-a", "digest-a", token),
    ).toBe(true);
    expect(
      verifyConfirmation("signing-secret", "admin-b", "digest-a", token),
    ).toBe(false);
    expect(
      verifyConfirmation("signing-secret", "admin-a", "digest-b", token),
    ).toBe(false);
    expect(
      verifyConfirmation(
        "signing-secret",
        "admin-a",
        "digest-a",
        signConfirmation(
          "signing-secret",
          "admin-a",
          "digest-a",
          Date.now() - 1,
        ),
      ),
    ).toBe(false);
  });
  it("does not follow shared users into another organization and includes org settings", () => {
    const data = emptyDataset();
    data.organizations = [{ id: org }, { id: "other" }];
    data.workspaces = [
      { id: workspace, organization_id: org },
      { id: "other-workspace", organization_id: "other" },
    ];
    data.user = [{ id: "user" }];
    data.organization_members = [
      { organization_id: org, user_id: "user" },
      { organization_id: "other", user_id: "user" },
    ];
    data.app_settings = [
      { key: `companion:organization:${org}` },
      { key: "global-setting" },
    ];
    data.account = [{ id: "account", user_id: "user", refresh_token: "keep" }];
    const result = selectOrganization(data, org);
    expect(result.organizations).toHaveLength(1);
    expect(result.workspaces).toHaveLength(1);
    expect(result.organization_members).toHaveLength(1);
    expect(result.account[0].refresh_token).toBe("keep");
    expect(result.app_settings).toHaveLength(1);
  });
  it("rejects a cross-organization resource dependency rather than silently omitting it", () => {
    const data = emptyDataset();
    data.organizations = [{ id: org }];
    data.workspaces = [{ id: workspace, organization_id: org }];
    data.agents = [{ id: "agent", workspace_id: "another-workspace" }];
    data.conversations = [{ workspace_id: workspace, agent_id: "agent" }];
    expect(() => selectOrganization(data, org)).toThrow(/Cross-organization/);
  });
  it("preserves tokens and history but expires sessions and does not resume jobs", () => {
    const data = emptyDataset();
    data.account = [{ refresh_token: "preserved" }];
    data.session = [{ expires_at: "2099-01-01" }];
    data.agent_runs = [{ status: "queued", lease_owner: "old-worker" }];
    data.workspace_token_reservations = [{ status: "active" }];
    data.scheduled_tasks = [{ enabled: true }];
    data.user = [{ role: "admin" }];
    pauseRestoredData(data, { type: "organization", organizationId: org });
    expect(data.account[0].refresh_token).toBe("preserved");
    expect(data.session[0].expires_at).toMatch(/^1970/);
    expect(data.agent_runs[0]).toMatchObject({
      status: "cancelled",
      lease_owner: null,
    });
    expect(data.workspace_token_reservations[0].status).toBe("expired");
    expect(data.scheduled_tasks[0].enabled).toBe(false);
    expect(data.user[0].role).toBeNull();
  });
});
