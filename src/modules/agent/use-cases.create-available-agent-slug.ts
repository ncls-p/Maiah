import { ONBOARDING_BUILTIN_TOOL_NAMES } from "@/modules/agent/onboarding-tools";
import { BUILTIN_TOOL_SUMMARIES } from "@/modules/tool/builtin-tools-catalog";
import { getToolBindingsForVersion,type ToolBindingInput } from "@/modules/tool/use-cases";
import { agentSlugExists,slugifyAgentName } from "./use-cases.agent-row";

export async function createAvailableAgentSlug(workspaceId: string, preferredNameOrSlug: string) {
  const base = slugifyAgentName(preferredNameOrSlug).slice(0, 96);
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const suffix = attempt === 0 ? "" : `-${attempt + 1}`;
    const slug = `${base}${suffix}`.slice(0, 128);
    if (!(await agentSlugExists(workspaceId, slug))) return slug;
  }
  return `${base.slice(0, 88)}-${Date.now().toString(36)}`;
}

export function stripBuiltinApprovalOverrides(bindings: ToolBindingInput[] | undefined): ToolBindingInput[] | undefined {
  return bindings?.map((binding) => {
    if (binding.toolSource !== "builtin") return binding;
    return { ...binding, requireApproval: undefined };
  });
}

export function getOnboardingToolBindings(): ToolBindingInput[] {
  return ONBOARDING_BUILTIN_TOOL_NAMES.map((name) => {
    const tool = BUILTIN_TOOL_SUMMARIES.find((candidate) => candidate.name === name);
    if (!tool) throw new Error(`Onboarding tool not found: ${name}`);

    return {
      toolSource: "builtin",
      toolId: tool.id,
      requireApproval: false,
    };
  });
}

export async function preserveBuiltinApprovalOverrides(bindings: ToolBindingInput[] | undefined, activeVersionId: string | null, visibility: { workspaceId: string; userId: string }): Promise<ToolBindingInput[] | undefined> {
  if (!bindings || !activeVersionId) return stripBuiltinApprovalOverrides(bindings);
  const existingBindings = await getToolBindingsForVersion(activeVersionId, visibility);
  const builtinApprovalByToolId = new Map(existingBindings.filter((binding) => binding.toolSource === "builtin").map((binding) => [binding.toolId, binding.requireApproval]));
  return bindings.map((binding) => {
    if (binding.toolSource !== "builtin") return binding;
    return {
      ...binding,
      requireApproval: builtinApprovalByToolId.get(binding.toolId),
    };
  });
}
