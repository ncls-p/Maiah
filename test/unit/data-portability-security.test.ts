import { describe, expect, it, vi } from "vitest";
import type { PoolClient } from "pg";
import {
  authTokenCodec,
  transformAccountTokens,
} from "@/modules/data-portability/oauth-tokens";
import { emptyDataset } from "@/modules/data-portability/registry";
import { selectOrganization } from "@/modules/data-portability/scope";
import { authorizePortabilitySession } from "@/modules/data-portability/authorization";
import { publicPortabilityError } from "@/modules/data-portability/public-error";

describe("portability security details", () => {
  it("migrates versioned Better Auth OAuth tokens across unrelated secret versions", async () => {
    const source = authTokenCodec("source-legacy", [
      { version: 2, value: "source-current-secret" },
    ]);
    const target = authTokenCodec("target-legacy", [
      { version: 9, value: "target-current-secret" },
    ]);
    const data = emptyDataset();
    data.account = [
      {
        provider_id: "microsoft",
        access_token: await source.encrypt("access"),
        refresh_token: await source.encrypt("refresh"),
        password: null,
      },
    ];
    await transformAccountTokens(data, "export", source);
    expect(JSON.stringify(data)).not.toContain("source-current-secret");
    await transformAccountTokens(data, "import", target);
    expect(await target.decrypt(String(data.account[0].refresh_token))).toBe(
      "refresh",
    );
    await expect(
      source.decrypt(String(data.account[0].refresh_token)),
    ).rejects.toThrow();
  });
  it("discovers cross-organization dependencies inside structured workflow configuration", () => {
    const data = emptyDataset();
    data.organizations = [{ id: "org" }];
    data.workspaces = [{ id: "workspace", organization_id: "org" }];
    data.workflows = [{ id: "workflow", workspace_id: "workspace" }];
    data.workflow_versions = [
      {
        workflow_id: "workflow",
        definition_json: { nodes: [{ data: { agentId: "foreign-agent" } }] },
      },
    ];
    data.agents = [{ id: "foreign-agent", workspace_id: "foreign-workspace" }];
    expect(() => selectOrganization(data, "org")).toThrow(/Cross-organization/);
  });
  it("preserves identities referenced only by historical run actors", () => {
    const data = emptyDataset();
    data.organizations = [{ id: "org" }];
    data.workspaces = [{ id: "workspace", organization_id: "org" }];
    data.user = [{ id: "actor" }];
    data.agent_runs = [
      {
        workspace_id: "workspace",
        actor_principal_type: "user",
        actor_principal_id: "actor",
      },
    ];
    expect(selectOrganization(data, "org").user).toEqual([{ id: "actor" }]);
  });
  it("rechecks a parameterized live administrator session under the transaction lock", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 0 });
    const client = { query } as unknown as PoolClient;
    const authorize = authorizePortabilitySession("user-id", "session-id");
    await expect(authorize(client)).resolves.toBeUndefined();
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("impersonated_by is null"),
      ["user-id", "session-id"],
    );
    await expect(authorize(client)).rejects.toThrow(/revoked/);
  });
  it("does not forward arbitrary SDK error messages, SQL details or archive values", () => {
    expect(
      publicPortabilityError(new Error("private-token-123")).message,
    ).not.toContain("private-token-123");
    expect(
      publicPortabilityError(
        new Error("Administrator session was revoked, expired or impersonated"),
      ).status,
    ).toBe(403);
  });
});
