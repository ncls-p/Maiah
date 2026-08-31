import {
  buildCustomToolManifest,
  buildMcpPresetManifest,
  buildSkillContentManifest,
  buildSkillManifest,
  jsonRecord,
} from "@/modules/marketplace/manifest-builders.json-record";
import * as _dbModule from "@/server/infrastructure/db";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Chain = {
  select: ReturnType<typeof vi.fn>;
  from: ReturnType<typeof vi.fn>;
  where: ReturnType<typeof vi.fn>;
};

vi.mock("@/server/infrastructure/db", () => {
  const chain = {} as Chain;
  chain.select = vi.fn().mockReturnThis();
  chain.from = vi.fn().mockReturnThis();
  chain.where = vi.fn().mockResolvedValue([]);
  return {
    db: { select: vi.fn() },
    _c: chain,
  };
});

const dbModule = _dbModule as unknown as {
  db: { select: ReturnType<typeof vi.fn> };
  _c: Chain;
};

beforeEach(() => {
  dbModule.db.select.mockReset().mockReturnValue(dbModule._c);
  dbModule._c.select.mockReset().mockReturnThis();
  dbModule._c.from.mockReset().mockReturnThis();
  dbModule._c.where.mockReset().mockResolvedValue([]);
});

function skillRow(overrides: Record<string, unknown> = {}) {
  return {
    markdownFilesJson: null,
    sourcePackage: null,
    sourceSkillName: null,
    installCommand: null,
    metadataJson: null,
    description: null,
    ...overrides,
  } as unknown as Parameters<typeof buildSkillContentManifest>[0];
}

function serverRow(overrides: Record<string, unknown> = {}) {
  return {
    name: "files",
    transport: "stdio",
    command: null,
    url: null,
    enabled: true,
    requireApproval: false,
    healthStatus: null,
    encryptedHeadersJson: null,
    encryptedEnvJson: null,
    argsJson: null,
    ...overrides,
  } as unknown as Parameters<typeof buildMcpPresetManifest>[2];
}

function toolRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "tool-1",
    description: null,
    status: "active",
    inputSchemaJson: null,
    outputSchemaJson: null,
    n8nWorkflowId: null,
    n8nWorkflowUrl: null,
    metadataJson: null,
    ...overrides,
  } as unknown as Parameters<typeof buildCustomToolManifest>[0];
}

describe("manifest builders branch coverage", () => {
  it("classifies jsonRecord inputs", () => {
    expect(jsonRecord({ a: 1 })).toEqual({ a: 1 });
    expect(jsonRecord([1, 2])).toBeNull();
    expect(jsonRecord(null)).toBeNull();
    expect(jsonRecord("text")).toBeNull();
    expect(jsonRecord(42)).toBeNull();
  });

  it("builds a skill content manifest from markdown files and metadata", () => {
    const manifest = buildSkillContentManifest(
      skillRow({
        markdownFilesJson: [
          { path: "SKILL.md", content: "# Skill" },
        ],
        sourcePackage: "acme",
        sourceSkillName: "writer",
        installCommand: "npx install",
        metadataJson: { author: "Ada" },
      }),
    );
    expect(manifest.markdownFiles).toHaveLength(1);
    expect(manifest.sourcePackage).toBe("acme");
    expect(manifest.sourceSkillName).toBe("writer");
    expect(manifest.installCommand).toBe("npx install");
    expect(manifest.metadata).toEqual({ author: "Ada" });
    expect(manifest.fileCount).toBe(1);
  });

  it("builds a skill content manifest with null json columns", () => {
    const manifest = buildSkillContentManifest(skillRow());
    expect(manifest.markdownFiles).toEqual([]);
    expect(manifest.sourcePackage).toBeUndefined();
    expect(manifest.sourceSkillName).toBeUndefined();
    expect(manifest.installCommand).toBeUndefined();
    expect(manifest.metadata).toBeUndefined();
  });

  it("resolves skill manifest description precedence", () => {
    expect(
      buildSkillManifest(skillRow({ description: "row" }), "n", "param")
        .description,
    ).toBe("param");
    expect(
      buildSkillManifest(skillRow({ description: "row" }), "n", null)
        .description,
    ).toBe("row");
    expect(buildSkillManifest(skillRow(), "n", null).description).toBeUndefined();
  });

  it("builds a custom tool manifest with credential fields from name and label", async () => {
    dbModule._c.where.mockResolvedValue([
      {
        fieldsJson: [
          { name: "api_key", label: "API key", type: "password", required: true, description: "Secret" },
          { key: "token" },
          { not: "a field" },
          { label: "no key" },
        ],
      },
      { fieldsJson: "not-an-array" },
    ]);
    const manifest = await buildCustomToolManifest(
      toolRow({
        description: "row desc",
        inputSchemaJson: { type: "object" },
        outputSchemaJson: { type: "object" },
        n8nWorkflowId: "wf-1",
        n8nWorkflowUrl: "https://n8n.example/wf-1",
        metadataJson: { team: "platform" },
      }),
      "tool",
      null,
    );
    expect(manifest.description).toBe("row desc");
    expect(manifest.tool.inputSchema).toEqual({ type: "object" });
    expect(manifest.tool.outputSchema).toEqual({ type: "object" });
    expect(manifest.tool.n8nWorkflowId).toBe("wf-1");
    expect(manifest.tool.n8nWorkflowUrl).toBe("https://n8n.example/wf-1");
    expect(manifest.tool.metadata).toEqual({ team: "platform" });
    expect(manifest.tool.requiresCredentials).toBe(true);
    expect(manifest.tool.credentialSchema).toEqual([
      {
        key: "api_key",
        label: "API key",
        type: "password",
        required: true,
        description: "Secret",
      },
      {
        key: "token",
        label: "token",
        type: undefined,
        required: false,
        description: null,
      },
    ]);
  });

  it("builds a custom tool manifest without credentials or schemas", async () => {
    dbModule._c.where.mockResolvedValue([]);
    const manifest = await buildCustomToolManifest(toolRow(), "tool", "param");
    expect(manifest.description).toBe("param");
    expect(manifest.tool.inputSchema).toBeUndefined();
    expect(manifest.tool.outputSchema).toBeUndefined();
    expect(manifest.tool.n8nWorkflowId).toBeUndefined();
    expect(manifest.tool.n8nWorkflowUrl).toBeUndefined();
    expect(manifest.tool.metadata).toBeUndefined();
    expect(manifest.tool.requiresCredentials).toBe(false);
    expect(manifest.tool.credentialSchema).toBeUndefined();
  });

  it("builds an mcp preset manifest with env credentials and args", () => {
    const manifest = buildMcpPresetManifest(
      "preset",
      "desc",
      serverRow({
        command: "npx",
        argsJson: ["-y", "server"],
        url: "https://mcp.example",
        healthStatus: "healthy",
        encryptedEnvJson: { TOKEN: "enc" },
      }),
      [
        {
          name: "read",
          description: "Read files",
          inputSchemaJson: { type: "object" },
          outputSchemaJson: null,
          requireApproval: false,
          enabled: true,
        },
      ] as unknown as Parameters<typeof buildMcpPresetManifest>[3],
      "server",
    );
    expect(manifest.preset.command).toBe("npx");
    expect(manifest.preset.args).toEqual(["-y", "server"]);
    expect(manifest.preset.url).toBe("https://mcp.example");
    expect(manifest.preset.healthStatus).toBe("healthy");
    expect(manifest.preset.requiresCredentials).toBe(true);
    expect(manifest.preset.credentialSchema).toEqual([
      { key: "env:TOKEN", label: "Env: TOKEN", required: true },
    ]);
    expect(manifest.preset.tools[0].inputSchema).toEqual({ type: "object" });
    expect(manifest.preset.tools[0].outputSchema).toBeNull();
  });

  it("builds an mcp preset manifest without args, url, health, or credentials", () => {
    const manifest = buildMcpPresetManifest(
      "preset",
      null,
      serverRow(),
      [] as unknown as Parameters<typeof buildMcpPresetManifest>[3],
      "tool",
    );
    expect(manifest.description).toBeUndefined();
    expect(manifest.preset.command).toBeUndefined();
    expect(manifest.preset.args).toBeUndefined();
    expect(manifest.preset.url).toBeUndefined();
    expect(manifest.preset.healthStatus).toBeUndefined();
    expect(manifest.preset.requiresCredentials).toBe(false);
    expect(manifest.preset.credentialSchema).toBeUndefined();
  });
});