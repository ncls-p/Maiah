import {
  installCustomTool,
  installMcpPreset,
  resolveModelId,
  resolveProviderId,
  slugify,
} from "@/modules/marketplace/install-helpers.tx";
import type {
  McpPresetMarketplaceManifest,
  ToolMarketplaceManifest,
} from "@/modules/marketplace/manifest-types";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/infrastructure/db", () => ({
  db: { transaction: vi.fn() },
}));

type FakeTx = {
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  selectResults: unknown[][];
  insertResults: unknown[][];
  insertValues: unknown[];
};

function makeTx(): FakeTx {
  const state = {
    select: vi.fn(),
    insert: vi.fn(),
    selectResults: [] as unknown[][],
    insertResults: [] as unknown[][],
    insertValues: [] as unknown[],
  };
  let selectIndex = 0;
  let insertIndex = 0;
  state.select.mockImplementation(() => {
    const result = state.selectResults[selectIndex++] ?? [];
    return {
      from: vi.fn(() => ({
        where: vi.fn(() => ({ limit: vi.fn(async () => result) })),
      })),
    };
  });
  state.insert.mockImplementation(() => {
    const result = state.insertResults[insertIndex++] ?? [];
    return {
      values: vi.fn((values: unknown) => {
        state.insertValues.push(values);
        return { returning: vi.fn(async () => result) };
      }),
    };
  });
  return state;
}

let tx: FakeTx;
beforeEach(() => {
  tx = makeTx();
});

function presetManifest(
  overrides: Partial<McpPresetMarketplaceManifest["preset"]> = {},
  name = "Preset",
): McpPresetMarketplaceManifest {
  return {
    type: "mcp_preset",
    name,
    preset: {
      scope: "server",
      serverName: "files",
      transport: "stdio",
      enabled: true,
      requireApproval: false,
      requiresCredentials: false,
      tools: [],
      ...overrides,
    },
  };
}

function toolManifest(
  overrides: Partial<ToolMarketplaceManifest["tool"]> = {},
  name = "Tool",
  description?: string,
): ToolMarketplaceManifest {
  return {
    type: "custom_tool",
    name,
    description,
    tool: { status: "active", ...overrides },
  };
}

describe("install helpers branch coverage", () => {
  it("slugifies names", () => {
    expect(slugify("  Hello, World!  ")).toBe("hello-world");
    expect(slugify("___")).toBe("");
    expect(slugify("a".repeat(100))).toHaveLength(80);
  });

  it("resolves provider ids by id, then name, then fallback", async () => {
    tx.selectResults = [[{ id: "prov-by-id" }]];
    expect(
      await resolveProviderId(tx as never, "ws", "prov-by-id", "Acme"),
    ).toBe("prov-by-id");

    tx.selectResults = [[], [{ id: "prov-by-name" }]];
    expect(
      await resolveProviderId(tx as never, "ws", "missing", "Acme"),
    ).toBe("prov-by-name");

    tx.selectResults = [[], []];
    expect(
      await resolveProviderId(tx as never, "ws", "missing", "Nobody"),
    ).toBe("missing");

    expect(
      await resolveProviderId(tx as never, "ws", null, null),
    ).toBeNull();
  });

  it("resolves model ids by provider, id, and name", async () => {
    expect(await resolveModelId(tx as never, null, "m-1", "Any")).toBe("m-1");
    expect(await resolveModelId(tx as never, null, null, "Any")).toBeNull();

    tx.selectResults = [[{ id: "model-by-id" }]];
    expect(
      await resolveModelId(tx as never, "prov", "model-by-id", "GPT"),
    ).toBe("model-by-id");

    tx.selectResults = [[], [{ id: "model-by-name" }]];
    expect(
      await resolveModelId(tx as never, "prov", "missing", "GPT"),
    ).toBe("model-by-name");

    tx.selectResults = [[], []];
    expect(
      await resolveModelId(tx as never, "prov", "missing", "GPT"),
    ).toBe("missing");
  });

  it("installs mcp presets with tool scope and credentials", async () => {
    tx.insertResults = [[{ id: "server-1" }]];
    const result = await installMcpPreset(tx as never, {
      workspaceId: "ws",
      userId: "user",
      manifest: presetManifest(
        {
          scope: "tool",
          requiresCredentials: true,
          command: "npx",
          args: ["-y", "pkg"],
        },
        "Tool preset",
      ),
    });
    expect(result.server).toEqual({ id: "server-1" });
    expect(result.requiresCredentials).toBe(true);
    const values = tx.insertValues[0] as Record<string, unknown>;
    expect(values.name).toBe("Tool preset");
    expect(values.healthStatus).toBe("unknown");
    expect(values.command).toBe("npx");
    expect(values.argsJson).toEqual(["-y", "pkg"]);
    expect(tx.insert).toHaveBeenCalledTimes(1);
  });

  it("installs mcp presets with server scope, tools, and default health", async () => {
    tx.insertResults = [[{ id: "server-2" }], [{ id: "tool-1" }]];
    await installMcpPreset(tx as never, {
      workspaceId: "ws",
      userId: "user",
      manifest: presetManifest({
        healthStatus: undefined,
        tools: [
          {
            name: "read",
            description: null,
            inputSchema: null,
            outputSchema: null,
            requireApproval: false,
            enabled: true,
          },
        ],
      }),
    });
    const serverValues = tx.insertValues[0] as Record<string, unknown>;
    expect(serverValues.name).toBe("files");
    expect(serverValues.healthStatus).toBe("healthy");
    expect(serverValues.url).toBeNull();
    const toolValues = tx.insertValues[1] as Array<Record<string, unknown>>;
    expect(toolValues[0].mcpServerId).toBe("server-2");
    expect(toolValues[0].description).toBeNull();
    expect(tx.insert).toHaveBeenCalledTimes(2);
  });

  it("installs custom tools with description and status fallbacks", async () => {
    tx.insertResults = [[{ id: "tool-9" }]];
    const withDescription = await installCustomTool(tx as never, {
      workspaceId: "ws",
      userId: "user",
      manifest: toolManifest({}, "Tool", "From manifest"),
    });
    expect(withDescription.requiresCredentials).toBe(false);
    const firstValues = tx.insertValues[0] as Record<string, unknown>;
    expect(firstValues.description).toBe("From manifest");
    expect(firstValues.status).toBe("active");
    expect(firstValues.n8nWorkflowId).toBeNull();

    tx.insertResults = [[{ id: "tool-10" }]];
    tx.insertValues = [];
    const withFallback = await installCustomTool(tx as never, {
      workspaceId: "ws",
      userId: "user",
      itemDescription: "From item",
      manifest: toolManifest(
        {
          status: undefined,
          requiresCredentials: true,
          n8nWorkflowId: "wf-1",
          n8nWorkflowUrl: "https://n8n.test/wf-1",
          inputSchema: { type: "object" },
          metadata: { team: "platform" },
        },
        "Tool",
        undefined,
      ),
    });
    expect(withFallback.requiresCredentials).toBe(true);
    const secondValues = tx.insertValues[0] as Record<string, unknown>;
    expect(secondValues.description).toBe("From item");
    expect(secondValues.status).toBe("active");
    expect(secondValues.n8nWorkflowId).toBe("wf-1");
    expect(secondValues.inputSchemaJson).toEqual({ type: "object" });
    expect(secondValues.metadataJson).toEqual({ team: "platform" });
  });
});