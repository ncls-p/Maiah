import {
  extractCredentialFields,
  manifestSummary,
} from "@/modules/marketplace/publish-preview.publish-preview-result";
import type {
  AgentMarketplaceManifest,
  MarketplaceManifest,
  McpPresetMarketplaceManifest,
  SkillMarketplaceManifest,
  ToolMarketplaceManifest,
} from "@/modules/marketplace/manifest-types";
import { describe, expect, it } from "vitest";

function agentManifest(
  overrides: Partial<AgentMarketplaceManifest> = {},
): AgentMarketplaceManifest {
  return {
    type: "agent",
    name: "Agent",
    agent: {
      systemPrompt: "be nice",
      providerId: "prov-1",
      modelId: "model-1",
    },
    ...overrides,
  };
}

function skillManifest(
  overrides: Partial<SkillMarketplaceManifest> = {},
): SkillMarketplaceManifest {
  return {
    type: "skill",
    name: "Skill",
    skill: {
      markdownFiles: [{ path: "SKILL.md", content: "# S" }],
      totalBytes: 10,
    },
    ...overrides,
  };
}

function toolManifest(
  overrides: Partial<ToolMarketplaceManifest> = {},
): ToolMarketplaceManifest {
  return {
    type: "custom_tool",
    name: "Tool",
    tool: { status: "active", requiresCredentials: false },
    ...overrides,
  };
}

function presetManifest(
  overrides: Partial<McpPresetMarketplaceManifest> = {},
): McpPresetMarketplaceManifest {
  return {
    type: "mcp_preset",
    name: "Preset",
    preset: {
      scope: "server",
      serverName: "files",
      transport: "stdio",
      enabled: true,
      requireApproval: false,
      requiresCredentials: false,
      tools: [{ name: "read", requireApproval: false, enabled: true }],
    },
    ...overrides,
  };
}

describe("publish preview result branch coverage", () => {
  it("summarizes an agent manifest with and without optional bindings", () => {
    const full = manifestSummary(
      agentManifest({
        agent: {
          systemPrompt: "be nice",
          providerName: "Acme",
          modelName: "acme-1",
        },
        toolBindings: [{ source: "builtin", ref: "web", requireApproval: false }],
        skillBindings: [{ ref: "s1" }],
        knowledgeBindings: [{ name: "kb" }],
        specialists: [{ manifest: agentManifest({ name: "Sub" }) }],
        bundledResources: {
          skills: [{ name: "s", skill: skillManifest().skill }],
          mcpPresets: [presetManifest()],
          customTools: [toolManifest()],
        },
      }),
    );
    expect(full).toEqual({
      type: "agent",
      model: "acme-1",
      provider: "Acme",
      toolBindings: 1,
      skillBindings: 1,
      knowledgeBindings: 1,
      specialists: 1,
      bundledSkills: 1,
      bundledMcp: 1,
      bundledCustomTools: 1,
      hasSystemPrompt: true,
    });
    const bare = manifestSummary(agentManifest());
    expect(bare).toEqual({
      type: "agent",
      model: "model-1",
      provider: "prov-1",
      toolBindings: 0,
      skillBindings: 0,
      knowledgeBindings: 0,
      specialists: 0,
      bundledSkills: 0,
      bundledMcp: 0,
      bundledCustomTools: 0,
      hasSystemPrompt: true,
    });
    const noPrompt = manifestSummary(
      agentManifest({ agent: { providerId: "p", modelId: "m" } }),
    );
    expect(noPrompt.hasSystemPrompt).toBe(false);
  });

  it("summarizes skill, custom tool, and mcp preset manifests", () => {
    expect(
      manifestSummary(
        skillManifest({
          skill: {
            markdownFiles: [{ path: "a.md", content: "a" }],
            totalBytes: 5,
          },
        }),
      ),
    ).toEqual({
      type: "skill",
      fileCount: 1,
      totalBytes: 5,
      sourcePackage: undefined,
    });
    expect(
      manifestSummary(
        skillManifest({
          skill: {
            markdownFiles: [{ path: "a.md", content: "a" }],
            fileCount: 9,
            totalBytes: 5,
            sourcePackage: "pkg",
          },
        }),
      ),
    ).toEqual({ type: "skill", fileCount: 9, totalBytes: 5, sourcePackage: "pkg" });
    expect(
      manifestSummary(
        toolManifest({
          tool: {
            status: "active",
            inputSchema: { type: "object" },
            n8nWorkflowId: "wf",
            requiresCredentials: true,
          },
        }),
      ),
    ).toEqual({
      type: "custom_tool",
      status: "active",
      hasInputSchema: true,
      hasOutputSchema: false,
      n8nWorkflow: true,
      requiresCredentials: true,
    });
    expect(manifestSummary(presetManifest())).toEqual({
      type: "mcp_preset",
      scope: "server",
      transport: "stdio",
      toolCount: 1,
      enabled: true,
      requiresCredentials: false,
    });
  });

  it("extracts credential fields from custom tools and presets", () => {
    expect(
      extractCredentialFields(
        toolManifest({
          tool: {
            status: "active",
            requiresCredentials: true,
            credentialSchema: [
              { key: "k", label: "K", required: true, description: "d" },
            ],
          },
        }),
      ),
    ).toEqual([{ key: "k", label: "K", required: true, description: "d" }]);
    expect(
      extractCredentialFields(
        presetManifest({
          preset: {
            scope: "server",
            serverName: "files",
            transport: "stdio",
            enabled: true,
            requireApproval: false,
            requiresCredentials: true,
            credentialSchema: [{ key: "t", label: "T" }],
            tools: [],
          },
        }),
      ),
    ).toEqual([{ key: "t", label: "T", required: undefined, description: undefined }]);
    expect(extractCredentialFields(toolManifest())).toEqual([]);
    expect(extractCredentialFields(presetManifest())).toEqual([]);
  });

  it("extracts agent credential fields from bundles and specialist recursion", () => {
    const specialist = agentManifest({
      name: "Sub",
      bundledResources: {
        skills: [],
        mcpPresets: [
          presetManifest({
            preset: {
              scope: "server",
              serverName: "sub-files",
              transport: "stdio",
              enabled: true,
              requireApproval: false,
              requiresCredentials: true,
              credentialSchema: [{ key: "s", label: "S" }],
              tools: [],
            },
          }),
        ],
        customTools: [],
      },
    });
    const fields = extractCredentialFields(
      agentManifest({
        bundledResources: {
          skills: [],
          mcpPresets: [
            presetManifest({
              preset: {
                scope: "server",
                serverName: "files",
                transport: "stdio",
                enabled: true,
                requireApproval: false,
                requiresCredentials: true,
                credentialSchema: [{ key: "t", label: "T" }],
                tools: [],
              },
            }),
          ],
          customTools: [
            toolManifest({
              name: "Tool",
              tool: {
                status: "active",
                requiresCredentials: true,
                credentialSchema: [{ key: "c", label: "C" }],
              },
            }),
          ],
        },
        specialists: [{ manifest: specialist }],
      }),
    );
    expect(fields).toEqual([
      { key: "files:t", label: "files — T", required: undefined, description: undefined },
      { key: "Tool:c", label: "Tool — C", required: undefined, description: undefined },
      { key: "Sub / sub-files:s", label: "Sub / sub-files — S", required: undefined, description: undefined },
    ]);
    expect(extractCredentialFields(agentManifest())).toEqual([]);
  });

  it("returns no credential fields for skills", () => {
    expect(extractCredentialFields(skillManifest())).toEqual([]);
  });
});