import { describe, expect, it } from "vitest";
import type { PoolClient } from "pg";
import { digest } from "@/modules/data-portability/archive";
import { connectPortability } from "@/modules/data-portability/context";
import {
  exportObjects,
  type ObjectStore,
} from "@/modules/data-portability/objects";
import { emptyDataset, tables } from "@/modules/data-portability/registry";
import { readPortabilityRequest } from "@/modules/data-portability/request";
import { pauseRestoredData } from "@/modules/data-portability/restore-policy";
import {
  selectOrganization,
  unresolvedReferences,
} from "@/modules/data-portability/scope";
import {
  transformDatasetSecrets,
  type SecretCodec,
} from "@/modules/data-portability/secrets";
import { isDefiniteCommitFailure } from "@/modules/data-portability/service";
import {
  assertReferencesAbsent,
  INSTANCE_TARGET_REQUIRED,
  prepareTarget,
} from "@/modules/data-portability/target";
import { keyedSecretCodec } from "@/modules/data-portability/context";
import { publicPortabilityError } from "@/modules/data-portability/public-error";

const org = "10000000-0000-4000-8000-000000000001";
const workspace = "20000000-0000-4000-8000-000000000001";
const otherWorkspace = "20000000-0000-4000-8000-000000000002";
const prefixes = { attachments: "chat-attachments", code: "code-workspaces" };

function memoryStore(files: Record<string, string>): ObjectStore {
  const inventory = Object.entries(files)
    .map(([key, content]) => ({
      key,
      etag: digest(content),
      size: Buffer.byteLength(content),
    }))
    .sort((a, b) => a.key.localeCompare(b.key));
  return {
    list: async () => inventory,
    read: async (key) => ({
      bytes: Buffer.from(files[key]),
      contentType: "application/octet-stream",
    }),
    exists: async () => false,
    create: async () => "etag",
    removeCreated: async () => undefined,
  };
}
function organizationData() {
  const data = emptyDataset();
  data.organizations = [{ id: org }];
  data.workspaces = [{ id: workspace, organization_id: org }];
  return data;
}
const owner = (workspaceId: string, files: { path: string }[] = []) =>
  JSON.stringify({ workspaceId, files });

describe("portability object ownership", () => {
  it("treats only <prefix>/<id>/metadata.json as ownership metadata", async () => {
    const store = memoryStore({
      "code-workspaces/p1/metadata.json": owner(workspace, [
        { path: "src/metadata.json" },
      ]),
      "code-workspaces/p1/files/src/metadata.json": "not json at all",
      "code-workspaces/p1/files/metadata.json": owner(otherWorkspace),
      "code-workspaces/p2/metadata.json": owner(otherWorkspace),
      "code-workspaces/p2/files/secret.txt": "other tenant",
    });
    const scoped = await exportObjects(
      store,
      organizationData(),
      { type: "organization", organizationId: org },
      prefixes,
    );
    expect(scoped.map((object) => object.key)).toEqual([
      "code-workspaces/p1/files/metadata.json",
      "code-workspaces/p1/files/src/metadata.json",
      "code-workspaces/p1/metadata.json",
    ]);
    const instance = await exportObjects(
      store,
      organizationData(),
      { type: "instance" },
      prefixes,
    );
    expect(instance).toHaveLength(5);
  });
  it("refuses to silently skip stored files without owner metadata in an organization export", async () => {
    const store = memoryStore({
      "chat-attachments/orphan/data.bin": "orphan",
    });
    await expect(
      exportObjects(
        store,
        organizationData(),
        { type: "organization", organizationId: org },
        prefixes,
      ),
    ).rejects.toThrow(/without owner metadata/);
    expect(
      await exportObjects(
        store,
        organizationData(),
        { type: "instance" },
        prefixes,
      ),
    ).toHaveLength(1);
  });
});

describe("portability secrets", () => {
  const codec = keyedSecretCodec("11".repeat(32), "default");
  it("never blocks an export on user text shaped like a ciphertext or the marker", async () => {
    const data = emptyDataset();
    const shaped = JSON.stringify({ ct: "", iv: "", kid: "default" });
    data.conversations = [{ id: "c", title: shaped }];
    data.workflow_versions = [
      {
        id: "w",
        definition_json: {
          __maiah_portable_secret_v1: "user value",
          nested: { __maiah_portable_escaped_v1: { token: shaped } },
        },
      },
    ];
    data.ai_providers = [
      { id: "p", encrypted_api_key: await codec.encrypt("provider-key") },
    ];
    const original = structuredClone(data);
    await transformDatasetSecrets(data, "export", codec);
    expect(JSON.stringify(data)).toContain("provider-key");
    const target = keyedSecretCodec("22".repeat(32), "target");
    await transformDatasetSecrets(data, "import", target);
    expect(data.conversations).toEqual(original.conversations);
    expect(data.workflow_versions).toEqual(original.workflow_versions);
    expect(
      await target.decrypt(String(data.ai_providers[0].encrypted_api_key)),
    ).toBe("provider-key");
  });
  it("still fails closed when a server-written ciphertext column cannot be decrypted", async () => {
    const data = emptyDataset();
    data.mcp_oauth_credentials = [
      {
        server_id: "s",
        encrypted_data: JSON.stringify({ ct: "", iv: "", kid: "default" }),
      },
    ];
    await expect(
      transformDatasetSecrets(data, "export", codec),
    ).rejects.toThrow();
  });
  it("rejects a crafted marker mixed with other keys on import", async () => {
    const data = emptyDataset();
    data.agents = [
      {
        id: "a",
        prompt_suggestions_json: { __maiah_portable_secret_v1: "x", other: 1 },
      },
    ];
    await expect(
      transformDatasetSecrets(data, "import", codec as SecretCodec),
    ).rejects.toThrow(/Reserved/);
  });
});

describe("portability organization identities", () => {
  it("exports non-member identities without credentials, sessions or GitHub links", () => {
    const data = organizationData();
    data.user = [{ id: "member" }, { id: "outsider" }];
    data.organization_members = [
      { id: "m", organization_id: org, user_id: "member" },
    ];
    data.marketplace_items = [
      { id: "item", publisher_workspace_id: workspace },
    ];
    data.marketplace_ratings = [
      { id: "rating", item_id: "item", user_id: "outsider" },
    ];
    data.account = [
      { id: "a1", user_id: "member", password: "member-hash" },
      { id: "a2", user_id: "outsider", password: "outsider-hash" },
    ];
    data.session = [{ id: "s2", user_id: "outsider", token: "t" }];
    data.user_github_connections = [{ id: "g2", user_id: "outsider" }];
    const result = selectOrganization(data, org);
    expect(result.user.map((row) => row.id).sort()).toEqual([
      "member",
      "outsider",
    ]);
    expect(result.account.map((row) => row.id)).toEqual(["a1"]);
    expect(result.session).toHaveLength(0);
    expect(result.user_github_connections).toHaveLength(0);
  });
});

describe("portability destination checks", () => {
  function fakeClient(answers: (sql: string) => unknown) {
    const statements: string[] = [];
    const client = {
      query: async (sql: string) => {
        statements.push(sql);
        return answers(sql);
      },
    } as unknown as PoolClient;
    return { client, statements };
  }
  it("prepares a large destination with targeted queries only", async () => {
    const { client, statements } = fakeClient((sql) => {
      if (sql.includes("role = 'admin'")) return { rowCount: 1, rows: [{}] };
      if (sql.includes("lower(email)")) return { rowCount: 0, rows: [] };
      if (sql.includes("as used"))
        return { rowCount: 1, rows: [{ used: true }] };
      if (sql.includes("r.is_system"))
        return {
          rowCount: 1,
          rows: [
            {
              row: {
                id: "target-role",
                name: "owner",
                scope_type: "organization",
                is_system: true,
              },
            },
          ],
        };
      throw new Error(`Unexpected query: ${sql}`);
    });
    const data = organizationData();
    data.user = [{ id: "u", email: "New@Example.test" }];
    data.roles = [
      {
        id: "archive-role",
        name: "owner",
        scope_type: "organization",
        is_system: true,
      },
    ];
    data.role_bindings = [{ id: "b", role_id: "archive-role" }];
    await prepareTarget(client, data, {
      type: "organization",
      organizationId: org,
    });
    expect(data.roles).toHaveLength(0);
    expect(data.role_bindings[0].role_id).toBe("target-role");
    expect(statements).toHaveLength(3);
    expect(statements.join("\n")).not.toMatch(/to_jsonb\(t\)|limit \$1/);
  });
  it("refuses to merge an archived identity into an existing email", async () => {
    const { client } = fakeClient((sql) =>
      sql.includes("lower(email)")
        ? { rowCount: 1, rows: [{ email: "admin@example.test" }] }
        : sql.includes("role = 'admin'")
          ? { rowCount: 1, rows: [{}] }
          : { rowCount: 0, rows: [] },
    );
    const data = organizationData();
    data.user = [{ id: "u", email: "Admin@example.test" }];
    const failure = prepareTarget(client, data, {
      type: "organization",
      organizationId: org,
    });
    await expect(failure).rejects.toThrow(
      "same email (admin@example.test); identities are never merged",
    );
    const error = await failure.catch((caught: unknown) => caught);
    expect(publicPortabilityError(error)).toEqual({
      status: 409,
      message: (error as Error).message,
    });
  });
  const lazyRole = (id: string, creator: string, permissions: string[]) => ({
    id,
    name: "organization.admin",
    scope_type: "organization",
    is_system: true,
    created_by_user_id: creator,
    permissions_json: permissions,
  });
  function roleTarget(permissions: string[]) {
    return fakeClient((sql) => {
      if (sql.includes("role = 'admin'")) return { rowCount: 1, rows: [{}] };
      if (sql.includes("as used"))
        return { rowCount: 1, rows: [{ used: true }] };
      if (sql.includes("r.is_system"))
        return {
          rowCount: 1,
          rows: [{ row: lazyRole("target-role", "target-admin", permissions) }],
        };
      return { rowCount: 0, rows: [] };
    }).client;
  }
  it("remaps lazily created built-in roles whose only difference is their creator", async () => {
    const data = organizationData();
    data.roles = [lazyRole("archive-role", "source-admin", ["org.read"])];
    data.role_bindings = [{ id: "b", role_id: "archive-role" }];
    await prepareTarget(roleTarget(["org.read"]), data, {
      type: "organization",
      organizationId: org,
    });
    expect(data.roles).toHaveLength(0);
    expect(data.role_bindings[0].role_id).toBe("target-role");
  });
  it("still refuses built-in roles whose permissions differ", async () => {
    const data = organizationData();
    data.roles = [lazyRole("archive-role", "source-admin", ["org.write"])];
    await expect(
      prepareTarget(roleTarget(["org.read"]), data, {
        type: "organization",
        organizationId: org,
      }),
    ).rejects.toThrow(/Built-in role definitions differ/);
  });
  it("refuses crafted references to destination data outside the archive", async () => {
    const foreignAgent = "30000000-0000-4000-8000-000000000001";
    const data = organizationData();
    data.resource_organization_shares = [
      {
        id: "share",
        organization_id: org,
        resource_type: "agent",
        resource_id: foreignAgent,
        root_resource_type: "agent",
        root_resource_id: foreignAgent,
      },
    ];
    data.role_bindings = [
      {
        id: "binding",
        principal_type: "user",
        principal_id: "existing-target-user",
        resource_type: "organization",
        resource_id: org,
      },
    ];
    expect(selectOrganization(data, org).resource_organization_shares).toEqual(
      data.resource_organization_shares,
    );
    const references = unresolvedReferences(data);
    expect([...references.get("agents")!]).toEqual([foreignAgent]);
    expect([...references.get("user")!]).toEqual(["existing-target-user"]);
    const existing = fakeClient(() => ({ rowCount: 1, rows: [{}] }));
    await expect(
      assertReferencesAbsent(existing.client, references),
    ).rejects.toThrow(/existing destination data/);
    const dangling = fakeClient(() => ({ rowCount: 0, rows: [] }));
    await assertReferencesAbsent(dangling.client, references);
    // Non-UUID values are never compared against UUID keys.
    expect(dangling.statements.every((sql) => sql.includes("= any("))).toBe(
      true,
    );
  });
  it("refuses an instance archive on a started destination with an actionable message", async () => {
    const { client, statements } = fakeClient((sql) =>
      sql.includes("as used")
        ? { rowCount: 1, rows: [{ used: true }] }
        : { rowCount: 0, rows: [] },
    );
    const data = emptyDataset();
    data.user = [{ id: "u", email: "alice@example.test" }];
    const failure = prepareTarget(client, data, { type: "instance" });
    await expect(failure).rejects.toThrow(INSTANCE_TARGET_REQUIRED);
    expect(statements.some((sql) => sql.startsWith("delete"))).toBe(false);
    expect(
      publicPortabilityError(await failure.catch((error: unknown) => error)),
    ).toEqual({ status: 409, message: INSTANCE_TARGET_REQUIRED });
  });
  it("names only a registry table for unique conflicts", () => {
    expect(
      publicPortabilityError(
        Object.assign(new Error("Key (slug)=(deodis) already exists"), {
          code: "23505",
          table: "organizations",
        }),
      ).message,
    ).toBe(
      "Destination conflict in organizations: existing identities or resources must not be overwritten. Use a clean target.",
    );
    expect(
      publicPortabilityError(
        Object.assign(new Error("x"), { code: "23505", table: "<script>" }),
      ).message,
    ).not.toContain("<script>");
  });
  it("covers every registry table in the destination usage probe", async () => {
    const { client, statements } = fakeClient((sql) =>
      sql.includes("as used")
        ? { rowCount: 1, rows: [{ used: false }] }
        : { rowCount: 0, rows: [] },
    );
    await prepareTarget(client, emptyDataset(), { type: "instance" });
    const probe = statements.find((sql) => sql.includes("as used"))!;
    for (const table of tables)
      if (!["app_settings", "roles"].includes(table.name))
        expect(probe).toContain(`public."${table.name}"`);
    expect(statements).toContain("delete from public.roles");
  });
});

describe("portability restoration and transport", () => {
  it("withdraws handoffs, pending approvals and public links", () => {
    const data = emptyDataset();
    data.genesys_sessions = [{ state: "human" }, { state: "resumed" }];
    data.tool_invocations = [
      { status: "awaiting_approval" },
      { status: "pending_approval" },
      { status: "running" },
      { status: "success" },
    ];
    data.conversations = [
      {
        public_share_id: "share",
        public_shared_at: "2026-01-01",
        public_share_includes_files: true,
      },
    ];
    pauseRestoredData(data, { type: "instance" });
    expect(data.genesys_sessions.map((row) => row.state)).toEqual([
      "resumed",
      "resumed",
    ]);
    expect(data.tool_invocations.map((row) => row.status)).toEqual([
      "rejected",
      "rejected",
      "failed",
      "success",
    ]);
    expect(data.conversations[0]).toEqual({
      public_share_id: null,
      public_shared_at: null,
      public_share_includes_files: false,
    });
  });
  it("only treats connection loss or an unanswered COMMIT as ambiguous", () => {
    expect(isDefiniteCommitFailure({ code: "40001" })).toBe(true);
    expect(isDefiniteCommitFailure({ code: "23505" })).toBe(true);
    expect(isDefiniteCommitFailure({ code: "08006" })).toBe(false);
    expect(isDefiniteCommitFailure({ code: "57P01" })).toBe(false);
    expect(isDefiniteCommitFailure({ code: "ECONNRESET" })).toBe(false);
    expect(isDefiniteCommitFailure(new Error("socket closed"))).toBe(false);
  });
  it("reads the framed upload once and exposes the archive without copying fields into it", async () => {
    const fields = Buffer.from(JSON.stringify({ action: "preview" }));
    const length = Buffer.alloc(4);
    length.writeUInt32BE(fields.length);
    const parsed = await readPortabilityRequest(
      new Request("https://maiah.test", {
        method: "POST",
        headers: { "content-type": "application/vnd.maiah.portability" },
        body: Buffer.concat([length, fields, Buffer.from("ARCHIVE")]),
      }),
    );
    expect(parsed.fields).toEqual({ action: "preview" });
    expect(parsed.archive?.toString()).toBe("ARCHIVE");
    await expect(
      readPortabilityRequest(
        new Request("https://maiah.test", {
          method: "POST",
          headers: { "content-type": "application/vnd.maiah.portability" },
          body: Buffer.from([0, 0, 0xff, 0xff]),
        }),
      ),
    ).rejects.toThrow(/Invalid request body/);
  });
  it("honours a disabled certificate verification like the application pool", async () => {
    const connection = connectPortability({
      databaseUrl: "postgresql://user:password@127.0.0.1:1/db",
      databaseSsl: true,
      databaseSslRejectUnauthorized: false,
      encryptionKey: "11".repeat(32),
      encryptionKeyId: "default",
      authSecret: "auth-secret",
      storage: {
        endpoint: "http://127.0.0.1:1",
        region: "us-east-1",
        bucket: "bucket",
        accessKeyId: "a",
        secretAccessKey: "b",
      },
    });
    expect(
      (connection.context.pool as unknown as { options: { ssl: unknown } })
        .options.ssl,
    ).toEqual({ rejectUnauthorized: false });
    await connection.close();
  });
});
