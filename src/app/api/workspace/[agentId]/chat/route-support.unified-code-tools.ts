import { createCodeWorkspaceRuntime } from "@/modules/code-workspace/runtime";
import type { ChatAttachment } from "@/modules/chat/attachments";
import {
  workspaceBashInputSchema,
  workspaceEditInputSchema,
  workspaceReadInputSchema,
  workspaceWriteInputSchema,
} from "@/modules/code-workspace/runtime.schemas";
import { getBuiltInToolByName } from "@/modules/tool/builtin-tools";
import { canExecuteRestrictedTool } from "@/modules/tool/use-cases";
import type { ToolSet } from "ai";
import { BUILTIN_TOOL_SOURCE } from "./route-support.chat-request-schema";
import { createBuiltinToolExecute } from "./route-support.create-builtin-tool-execute";
import type { GateToolExecution } from "./route-support.tool-execution-context";

export const legacyWorkspaceToolNames = new Set([
  "run_code_sandbox",
  "code_workspace_create_project",
  "code_workspace_list_files",
  "code_workspace_read_file",
  "code_workspace_write_file",
  "code_workspace_replace_text",
  "code_workspace_delete_file",
  "github_get_publish_status",
  "github_publish_code_workspace",
]);

type RuntimeToolDefinition = {
  id: string;
  name: "read" | "edit" | "write" | "bash";
  description: string;
  riskLevel: "low" | "medium" | "high";
  inputSchema:
    | typeof workspaceReadInputSchema
    | typeof workspaceEditInputSchema
    | typeof workspaceWriteInputSchema
    | typeof workspaceBashInputSchema;
  execute: (input: never) => Promise<unknown>;
};

export function registerUnifiedCodeWorkspaceTools(input: {
  tools: ToolSet;
  workspaceId: string;
  userId: string;
  conversationId?: string;
  messageId?: string;
  projectId?: string;
  attachments?: ChatAttachment[];
  durable: boolean;
  nonInteractive?: boolean;
  emitEvent?: (event: Record<string, unknown>) => void;
  reserveToolCall: () => boolean;
  toolLimitReachedResult: () => unknown;
  gateToolExecution: GateToolExecution;
  policy: (name: "read" | "edit" | "write" | "bash") => {
    enabled: boolean;
    requireApproval: boolean;
  };
}) {
  const runtime = createCodeWorkspaceRuntime({
    workspaceId: input.workspaceId,
    userId: input.userId,
    projectId: input.projectId,
    durable: input.durable,
    attachments: input.attachments,
  });
  const definitions: RuntimeToolDefinition[] = [
    {
      id: "00000000-0000-4000-8000-000000000201",
      name: "read",
      description:
        "Read a workspace text file with optional 1-based offset and line limit. Continue from nextOffset when truncated.",
      riskLevel: "low",
      inputSchema: workspaceReadInputSchema,
      execute: (toolInput) => runtime.read(toolInput),
    },
    {
      id: "00000000-0000-4000-8000-000000000202",
      name: "edit",
      description:
        "Make one or more precise, non-overlapping replacements in a workspace file. Every oldText must match exactly once.",
      riskLevel: "medium",
      inputSchema: workspaceEditInputSchema,
      execute: (toolInput) => runtime.edit(toolInput),
    },
    {
      id: "00000000-0000-4000-8000-000000000203",
      name: "write",
      description:
        "Create or completely rewrite a workspace text file. Parent directories are created automatically.",
      riskLevel: "medium",
      inputSchema: workspaceWriteInputSchema,
      execute: (toolInput) => runtime.write(toolInput),
    },
    {
      id: "00000000-0000-4000-8000-000000000204",
      name: "bash",
      description:
        "Run a Bash command inside the isolated workspace. Use it for rg/find, file operations, tests, builds, Git inspection, Node.js, or Python. The workspace is checkpointed after the command.",
      riskLevel: "high",
      inputSchema: workspaceBashInputSchema,
      execute: (toolInput) => runtime.bash(toolInput),
    },
  ];

  for (const definition of definitions) {
    const policy = input.policy(definition.name);
    if (!policy.enabled) continue;
    input.tools[definition.name] = {
      description: definition.description,
      inputSchema: definition.inputSchema,
      execute: createBuiltinToolExecute(
        input,
        definition,
        {
          riskLevel: definition.riskLevel,
          requireApproval: policy.requireApproval,
        },
        input.reserveToolCall,
        input.toolLimitReachedResult,
        input.gateToolExecution,
        canExecuteRestrictedTool,
      ),
    };
  }
  return () => runtime.dispose();
}

type LegacyBinding = {
  binding: { requireApproval: boolean };
  definition: { name: string };
};

export function registerGovernedUnifiedCodeWorkspaceTools(
  input: Omit<
    Parameters<typeof registerUnifiedCodeWorkspaceTools>[0],
    "policy" | "durable"
  > & {
    durable: boolean;
    legacyBindings: LegacyBinding[];
    builtInPolicies: ReadonlyMap<
      string,
      { enabled?: boolean; requireApproval?: boolean }
    >;
    disabledToolKeys?: ReadonlySet<string>;
  },
) {
  const bindingByName = new Map(
    input.legacyBindings.map(({ binding, definition }) => [
      definition.name,
      binding,
    ]),
  );
  const legacyPolicyName = {
    read: "code_workspace_read_file",
    edit: "code_workspace_replace_text",
    write: "code_workspace_write_file",
    bash: "run_code_sandbox",
  } as const;
  return registerUnifiedCodeWorkspaceTools({
    ...input,
    policy: (name) => {
      const legacyName = legacyPolicyName[name];
      const organizationPolicy = input.builtInPolicies.get(legacyName);
      const binding = bindingByName.get(legacyName);
      const legacyDefinition = getBuiltInToolByName(legacyName);
      const disabled = legacyDefinition
        ? input.disabledToolKeys?.has(
            `${BUILTIN_TOOL_SOURCE}:${legacyDefinition.id}`,
          )
        : false;
      return {
        enabled: organizationPolicy?.enabled !== false && !disabled,
        requireApproval:
          organizationPolicy?.requireApproval ??
          binding?.requireApproval ??
          name === "bash",
      };
    },
  });
}
