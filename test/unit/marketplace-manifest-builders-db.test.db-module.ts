import { beforeEach,describe,expect,it,vi } from "vitest";

import { buildCustomToolManifest } from "@/modules/marketplace/manifest-builders";
import * as _dbModule from "@/server/infrastructure/db";

type Chain = {
  select: ReturnType<typeof vi.fn>;
  from: ReturnType<typeof vi.fn>;
  where: ReturnType<typeof vi.fn>;
  orderBy: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
};

function makeChain(): Chain {
  const chain = {} as Chain;
  for (const key of ["select", "from", "where", "orderBy"] as const) {
    chain[key] = vi.fn().mockReturnThis();
  }
  chain.limit = vi.fn().mockResolvedValue([]);
  return chain;
}

type DbModule = {
  db: { select: ReturnType<typeof vi.fn> };
  _c: Chain;
};

vi.mock("@/server/infrastructure/db", () => {
  const chain = makeChain();
  return {
    db: { select: vi.fn() },
    _c: chain,
  };
});

export const dbModule = _dbModule as unknown as DbModule;

export function resetDb() {
  dbModule.db.select.mockReset().mockReturnValue(dbModule._c);
  for (const key of ["select", "from", "where", "orderBy"] as const) {
    dbModule._c[key].mockReset().mockReturnThis();
  }
  dbModule._c.limit.mockReset().mockResolvedValue([]);
}

beforeEach(() => {
  vi.clearAllMocks();
  resetDb();
});

export const customToolRow = {
  id: "custom-1",
  workspaceId: "ws-1",
  createdById: "user-1",
  name: "Discord notifier",
  description: "Send alerts",
  status: "workflow_created",
  n8nWorkflowId: "wf-1",
  n8nWorkflowUrl: "https://n8n.test/workflow/wf-1",
  inputSchemaJson: {
    type: "object",
    properties: { message: { type: "string" } },
  },
  outputSchemaJson: { type: "object" },
  metadataJson: { source: "builder" },
};

describe("buildCustomToolManifest", () => {
  it("builds credential schemas from secret requests and omits encrypted refs by default", async () => {
    dbModule._c.where.mockResolvedValueOnce([
      {
        fieldsJson: [
          {
            name: "webhookUrl",
            label: "Webhook URL",
            type: "secret",
            required: true,
          },
          { key: "token", label: "Token", description: "Bot token" },
          { label: "ignored" },
        ],
      },
    ]);

    const manifest = await buildCustomToolManifest(customToolRow as never, "Discord", null);

    expect(manifest.type).toBe("custom_tool");
    expect(manifest.description).toBe("Send alerts");
    expect(manifest.tool.requiresCredentials).toBe(true);
    expect(manifest.tool).not.toHaveProperty("secretsIncluded");
    expect(manifest.tool).not.toHaveProperty("encryptedCredentialRefs");
    expect(manifest.tool.credentialSchema).toEqual([
      {
        key: "webhookUrl",
        label: "Webhook URL",
        type: "secret",
        required: true,
        description: null,
      },
      {
        key: "token",
        label: "Token",
        type: undefined,
        required: false,
        description: "Bot token",
      },
    ]);
  });

  it("never queries or exports encrypted credential references", async () => {
    dbModule._c.where.mockResolvedValueOnce([{ fieldsJson: [{ key: "apiKey", label: "API key" }] }]);

    const manifest = await buildCustomToolManifest(customToolRow as never, "Discord", "Override");

    expect(manifest.description).toBe("Override");
    expect(manifest.tool).not.toHaveProperty("secretsIncluded");
    expect(manifest.tool).not.toHaveProperty("encryptedCredentialRefs");
    expect(dbModule._c.where).toHaveBeenCalledTimes(1);
  });
});
