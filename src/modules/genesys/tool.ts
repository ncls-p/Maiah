import type { BuiltInToolDefinition } from "@/modules/tool/builtin-tools";
import { HANDOFF_TOOL, handoffInput, GenesysError } from "./contracts";
export const genesysHandoffTool: BuiltInToolDefinition = {
  ...HANDOFF_TOOL,
  inputSchema: handoffInput,
  execute: async (input, context) => {
    if (
      !context?.interactiveChat ||
      !context.conversationId ||
      !context.messageId ||
      !context.emitEvent
    )
      throw new GenesysError("GENESYS_INTERACTIVE_ONLY");
    const { requestHandoff } = await import("./sessions");
    return requestHandoff(
      context.userId,
      context.conversationId,
      input,
      context.messageId,
    );
  },
};
