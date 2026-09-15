import {
  QUESTION_FORM_TOOL,
  questionFormInput,
} from "@/modules/question-form/contracts";
import { HANDOFF_TOOL, handoffInput } from "@/modules/genesys/contracts";
import { commonSchemas } from "./builtin-tool-json-schema.common-schemas";
import { fallbackSchema } from "./builtin-tool-json-schema.fallback-schema";
import { z } from "zod";
import { workflowToolSchemas } from "@/modules/workflows/assistant-tool-contracts";

export function builtInToolInputSchemaJson(toolName: string) {
  if (toolName === QUESTION_FORM_TOOL.name)
    return z.toJSONSchema(questionFormInput);
  if (toolName === HANDOFF_TOOL.name) return z.toJSONSchema(handoffInput);
  if (Object.hasOwn(workflowToolSchemas, toolName)) {
    return z.toJSONSchema(
      workflowToolSchemas[toolName as keyof typeof workflowToolSchemas],
    );
  }
  return commonSchemas[toolName] ?? fallbackSchema;
}
