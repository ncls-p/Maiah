import { z } from "zod";

import {
  readCodeWorkspaceFile,
  writeCodeWorkspaceFile,
} from "@/modules/code-workspace/storage";
import { codeWorkspaceReplaceTextInputSchema } from "./builtin-tool-primitives";
import type { ToolRiskLevel } from "./builtin-tools-catalog";

export interface BuiltInToolExecutionContext {
  workspaceId: string;
  userId: string;
  conversationId?: string;
  messageId?: string;
  emitEvent?: (event: Record<string, unknown>) => void;
}

export interface BuiltInToolDefinition<Input = unknown, Output = unknown> {
  id: string;
  name: string;
  displayName: string;
  description: string;
  riskLevel: ToolRiskLevel;
  category: string;
  inputSchema: z.ZodType<Input>;
  execute(
    input: Input,
    context?: BuiltInToolExecutionContext,
  ): Promise<Output> | Output;
}

export function requireCodeWorkspaceContext(
  context: BuiltInToolExecutionContext | undefined,
) {
  if (!context?.workspaceId) {
    throw new Error("Code workspace tools require chat workspace context.");
  }
  return context;
}

export async function replaceCodeWorkspaceText(
  input: z.infer<typeof codeWorkspaceReplaceTextInputSchema>,
  context: BuiltInToolExecutionContext,
) {
  const existing = await readCodeWorkspaceFile({
    projectId: input.projectId,
    workspaceId: context.workspaceId,
    userId: context.userId,
    filePath: input.path,
  });
  const occurrences = existing.content.split(input.oldText).length - 1;
  if (occurrences === 0) {
    throw new Error("oldText was not found in the target file.");
  }
  if (!input.replaceAll && occurrences > 1) {
    throw new Error(
      "oldText appears multiple times. Set replaceAll to true or provide a more specific oldText.",
    );
  }
  const nextContent = input.replaceAll
    ? existing.content.split(input.oldText).join(input.newText)
    : existing.content.replace(input.oldText, input.newText);
  return writeCodeWorkspaceFile({
    projectId: input.projectId,
    workspaceId: context.workspaceId,
    userId: context.userId,
    filePath: input.path,
    content: nextContent,
  });
}

export const MEDIUM_RISK_LEVEL = "medium";
