import { buildBoundTools } from "@/app/api/workspace/[agentId]/chat/route-support.build-bound-tools";
import { buildSkillsRegistryPrompt } from "@/modules/skills/use-cases";
import type { AiHubToolApprovalPolicy } from "@/modules/tool/approval-policy";

/** Use the same saved tool, RAG and skill bindings as this assistant's chat runtime. */
export async function buildWorkflowBuilderCapabilities(input: {
  workspaceId: string;
  userId: string;
  version: {
    id: string;
    systemPrompt?: string | null;
    maxToolCalls?: number | null;
    approvalPolicyJson?: unknown;
  };
}) {
  const skillsPrompt = await buildSkillsRegistryPrompt(input.version.id);
  const bound = await buildBoundTools({
    agentVersionId: input.version.id,
    workspaceId: input.workspaceId,
    userId: input.userId,
    maxToolCalls: input.version.maxToolCalls ?? 12,
    approvalPolicy: input.version
      .approvalPolicyJson as AiHubToolApprovalPolicy | null,
    hasSkills: Boolean(skillsPrompt),
    nonInteractive: true,
    includeWorkflowTools: false,
  });
  return {
    tools: bound.tools,
    system: [input.version.systemPrompt, skillsPrompt]
      .filter(Boolean)
      .join("\n\n"),
  };
}
