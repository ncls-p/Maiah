import type {
  Agent,
  AgentForm,
  BuiltinTool,
  CustomTool,
  McpServer,
  McpTool,
  ToolBindingState,
} from "./types";
import { isMcpToolApprovalForced } from "./utils";

export function buildEssentialPayload(
  form: AgentForm,
  agent: Agent,
  availableToolNames: Set<string>,
) {
  return {
    baseVersionId: agent.activeVersionId ?? null,
    name: form.name,
    slug: form.slug,
    description: form.description,
    systemPrompt: form.systemPrompt,
    providerId: form.providerId || undefined,
    modelId: form.modelId || undefined,
    promptSuggestions: form.promptSuggestions
      .split(/\n/)
      .map((value) => value.trim())
      .filter(Boolean),
    temperature: form.temperature,
    topP: form.topP,
    maxOutputTokens: Number(form.maxOutputTokens) || undefined,
    maxToolCalls: Number(form.maxToolCalls),
    toolChoice: form.toolChoice,
    generationSettings: {
      topK: Number(form.generationSettings.topK) || undefined,
      presencePenalty:
        form.generationSettings.presencePenalty === ""
          ? undefined
          : Number(form.generationSettings.presencePenalty),
      frequencyPenalty:
        form.generationSettings.frequencyPenalty === ""
          ? undefined
          : Number(form.generationSettings.frequencyPenalty),
      seed:
        form.generationSettings.seed === ""
          ? undefined
          : Number(form.generationSettings.seed),
      maxRetries:
        form.generationSettings.maxRetries === ""
          ? undefined
          : Number(form.generationSettings.maxRetries),
      stopSequences: form.generationSettings.stopSequences
        .split(/\n|,/)
        .map((value) => value.trim())
        .filter(Boolean),
      reasoningPresets: form.generationSettings.reasoningPresets,
    },
    responseFormat: form.responseFormat,
    memoryPolicy: form.memoryPolicy,
    guardrails: form.guardrails,
    approvalPolicy: {
      ...form.approvalPolicy,
      requireApprovalToolNames:
        form.approvalPolicy.requireApprovalToolNames?.filter((name) =>
          availableToolNames.has(name),
        ),
      denyToolNames: form.approvalPolicy.denyToolNames?.filter((name) =>
        availableToolNames.has(name),
      ),
    },
    ...(form.sharingMode !== form.originalSharingMode ||
    form.shareTargetEmail.trim()
      ? {
          sharingMode: form.sharingMode,
          shareTargetEmail:
            form.sharingMode === "specific_user"
              ? form.shareTargetEmail.trim()
              : undefined,
        }
      : {}),
    ...(form.accessScope !== form.originalAccessScope ||
    form.accessTeamId !== form.originalAccessTeamId
      ? {
          accessScope: form.accessScope,
          accessTeamId:
            form.accessScope === "team" ? form.accessTeamId : undefined,
        }
      : {}),
    ...(agent.canAdminCurate
      ? {
          isGlobal: form.isGlobal,
          isRecommended: form.isRecommended,
          curationLabel: form.curationLabel,
        }
      : {}),
  };
}

export function buildCapabilityBindings(input: {
  builtinTools: BuiltinTool[];
  builtinBindings: ToolBindingState;
  mcpTools: McpTool[];
  mcpServers: McpServer[];
  mcpBindings: ToolBindingState;
  customTools: CustomTool[];
  customBindings: ToolBindingState;
}) {
  const {
    builtinTools,
    builtinBindings,
    mcpTools,
    mcpServers,
    mcpBindings,
    customTools,
    customBindings,
  } = input;
  return [
    ...builtinTools
      .filter((tool) => builtinBindings[tool.id]?.enabled)
      .map((tool) => ({
        toolSource: "builtin" as const,
        toolId: tool.id,
        requireApproval: builtinBindings[tool.id]?.requireApproval,
      })),
    ...mcpTools
      .filter((tool) => tool.enabled && mcpBindings[tool.id]?.enabled)
      .map((tool) => ({
        toolSource: "mcp" as const,
        toolId: tool.id,
        mcpServerId: tool.mcpServerId,
        requireApproval:
          isMcpToolApprovalForced(tool, mcpServers) ||
          mcpBindings[tool.id]?.requireApproval,
      })),
    ...customTools
      .filter((tool) => customBindings[tool.id]?.enabled)
      .map((tool) => ({
        toolSource: "custom" as const,
        toolId: tool.id,
        requireApproval: customBindings[tool.id]?.requireApproval ?? true,
      })),
  ];
}
