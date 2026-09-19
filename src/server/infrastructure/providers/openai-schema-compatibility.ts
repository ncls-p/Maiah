import type {
  JSONObject,
  JSONSchema7,
  JSONSchema7Definition,
  LanguageModelV4,
} from "@ai-sdk/provider";
import { wrapLanguageModel } from "ai";

/**
 * propertyNames always validates strings, even when its schema only has enum,
 * $ref or combinators. Make that implicit type explicit for the OpenAI SDK.
 * The SDK removes this unsupported keyword and emits its compatibility warning.
 * Only the provider copy changes; original tool schemas/validators stay intact.
 */
export function explicitPropertyNameTypes(schema: JSONSchema7): JSONSchema7 {
  const result = { ...schema };
  if (schema.propertyNames != null) {
    result.propertyNames = {
      type: "string",
      allOf: [schema.propertyNames],
    };
  }
  const visit = (value: JSONSchema7Definition): JSONSchema7Definition =>
    typeof value === "boolean" ? value : explicitPropertyNameTypes(value);

  for (const key of [
    "properties",
    "patternProperties",
    "definitions",
    "$defs",
    "dependentSchemas",
  ] as const) {
    const record = (schema as Record<string, unknown>)[key];
    if (record && typeof record === "object") {
      (result as Record<string, unknown>)[key] = Object.fromEntries(
        Object.entries(record).map(([name, value]) => [name, visit(value)]),
      );
    }
  }
  for (const key of [
    "additionalProperties",
    "additionalItems",
    "contains",
    "not",
    "if",
    "then",
    "else",
  ] as const) {
    if (schema[key] != null) result[key] = visit(schema[key]);
  }
  for (const key of ["allOf", "anyOf", "oneOf"] as const) {
    if (schema[key]) result[key] = schema[key].map(visit);
  }
  if (schema.items != null) {
    result.items = Array.isArray(schema.items)
      ? schema.items.map(visit)
      : visit(schema.items);
  }
  if (schema.dependencies) {
    result.dependencies = Object.fromEntries(
      Object.entries(schema.dependencies).map(([key, value]) => [
        key,
        Array.isArray(value) ? value : visit(value),
      ]),
    );
  }
  // Do not traverse examples/default/const/enum: those are data, not schemas.
  return result;
}

export function withOpenAISchemaCompatibility(model: LanguageModelV4) {
  return wrapLanguageModel({
    model,
    middleware: {
      specificationVersion: "v4",
      transformParams: async ({ params }) => ({
        ...params,
        tools: params.tools?.map((tool) => {
          if (tool.type !== "function") return tool;
          const openai = tool.providerOptions?.openai;
          return {
            ...tool,
            inputSchema: explicitPropertyNameTypes(tool.inputSchema),
            ...(openai?.outputSchema && typeof openai.outputSchema === "object"
              ? {
                  providerOptions: {
                    ...tool.providerOptions,
                    openai: {
                      ...openai,
                      outputSchema: explicitPropertyNameTypes(
                        openai.outputSchema as JSONSchema7,
                      ) as JSONSchema7 & JSONObject,
                    },
                  },
                }
              : {}),
          };
        }),
        responseFormat:
          params.responseFormat?.type === "json" && params.responseFormat.schema
            ? {
                ...params.responseFormat,
                schema: explicitPropertyNameTypes(params.responseFormat.schema),
              }
            : params.responseFormat,
      }),
    },
  });
}
