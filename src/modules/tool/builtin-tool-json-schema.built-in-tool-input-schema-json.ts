import { commonSchemas } from "./builtin-tool-json-schema.common-schemas";
import { fallbackSchema } from "./builtin-tool-json-schema.fallback-schema";
import { z } from "zod";
import { workflowToolSchemas } from "@/modules/workflows/assistant-tool-contracts";

export function builtInToolInputSchemaJson(toolName: string) {
  if (Object.hasOwn(workflowToolSchemas, toolName)) {
    return z.toJSONSchema(
      workflowToolSchemas[toolName as keyof typeof workflowToolSchemas],
    );
  }
  return commonSchemas[toolName] ?? fallbackSchema;
}
