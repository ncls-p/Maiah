import { commonSchemas } from "./builtin-tool-json-schema.common-schemas";
import { fallbackSchema } from "./builtin-tool-json-schema.fallback-schema";

export function builtInToolInputSchemaJson(toolName: string) {
  return commonSchemas[toolName] ?? fallbackSchema;
}
