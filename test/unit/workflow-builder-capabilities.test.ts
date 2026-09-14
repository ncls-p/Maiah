import { expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  bound: vi.fn(async () => ({
    tools: {
      configured_mcp: { description: "MCP" },
      search_knowledge: { description: "RAG" },
      load_skill: { description: "Skill" },
    },
  })),
  skills: vi.fn(async () => "Configured skills registry"),
}));
vi.mock(
  "@/app/api/workspace/[agentId]/chat/route-support.build-bound-tools",
  () => ({ buildBoundTools: mocks.bound }),
);
vi.mock("@/modules/skills/use-cases", () => ({
  buildSkillsRegistryPrompt: mocks.skills,
}));
import { buildWorkflowBuilderCapabilities } from "@/modules/workflows/builder-capabilities";
it("loads the selected builder assistant's instructions, configured tools, RAG and skills", async () => {
  const result = await buildWorkflowBuilderCapabilities({
    workspaceId: "workspace",
    userId: "user",
    version: {
      id: "selected-version",
      systemPrompt: "Company procedures",
      maxToolCalls: 7,
      approvalPolicyJson: {},
    },
  });
  expect(result.system).toContain("Company procedures");
  expect(result.system).toContain("Configured skills registry");
  expect(result.tools).toHaveProperty("search_knowledge");
  expect(result.tools).toHaveProperty("configured_mcp");
  expect(result.tools).toHaveProperty("load_skill");
  expect(mocks.bound).toHaveBeenCalledWith(
    expect.objectContaining({
      agentVersionId: "selected-version",
      workspaceId: "workspace",
      userId: "user",
      maxToolCalls: 7,
      hasSkills: true,
      nonInteractive: true,
    }),
  );
});
