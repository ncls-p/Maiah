import type { BuiltInToolDefinition } from "@/modules/tool/builtin-tools.built-in-tool-execution-context";
import { QUESTION_FORM_TOOL, questionFormInput } from "./contracts";
export const questionFormTool: BuiltInToolDefinition = {
  ...QUESTION_FORM_TOOL,
  inputSchema: questionFormInput,
  execute(input, context) {
    if (
      !context?.interactiveChat ||
      !context.conversationId ||
      !context.messageId
    )
      throw new Error("QUESTION_FORM_INTERACTIVE_ONLY");
    return {
      kind: "question_form",
      version: 1,
      id: crypto.randomUUID(),
      conversationId: context.conversationId,
      form: questionFormInput.parse(input),
    };
  },
};
