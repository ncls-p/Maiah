import type {
  JSONObject,
  JSONSchema7,
  JSONSchema7Definition,
  LanguageModelV4CallOptions,
} from "@ai-sdk/provider";
import { afterEach, describe, expect, it, vi } from "vitest";
import { explicitPropertyNameTypes } from "@/server/infrastructure/providers/openai-schema-compatibility";
import { openaiCompatibleAdapter } from "@/server/infrastructure/providers/openai-compatible-adapter";

const names: JSONSchema7Definition[] = [
  { enum: ["color", "storage"] },
  { $ref: "#/$defs/name" },
  { anyOf: [{ const: "color" }, { pattern: "^storage" }] },
  { type: "string", pattern: "^[a-z]+$" },
  {},
  true,
  false,
];
const mapSchema = (propertyNames: JSONSchema7Definition): JSONSchema7 => ({
  type: "object",
  propertyNames,
  additionalProperties: { type: "string" },
});
const config = {
  kind: "openai-compatible" as const,
  name: "test",
  authType: "bearer" as const,
  apiKey: "test",
  baseUrl: "https://provider.test/v1",
  openaiCompatibleApiRoute: "responses" as const,
};

afterEach(() => vi.unstubAllGlobals());

describe("OpenAI schema compatibility", () => {
  it.each(["doGenerate", "doStream"] as const)(
    "prepares every tool through the real SDK in %s",
    async (method) => {
      // A deliberate HTTP rejection proves that schema preparation reached fetch.
      const fetchMock = vi
        .fn()
        .mockImplementation(async () =>
          Response.json(
            { error: { message: "captured request" } },
            { status: 400 },
          ),
        );
      vi.stubGlobal("fetch", fetchMock);
      const schema: JSONSchema7 = {
        type: "object",
        $defs: { name: { enum: ["color"] } },
        properties: Object.fromEntries(
          names.map((name, index) => [`map${index}`, mapSchema(name)]),
        ),
        required: ["map0"],
        additionalProperties: false,
      };
      const params: LanguageModelV4CallOptions = {
        prompt: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
        tools: ["mcp_catalog", "builtin_action", "custom_action"].map(
          (name) => ({
            type: "function",
            name,
            inputSchema: schema,
            strict: false,
            providerOptions: {
              openai: { outputSchema: schema as JSONSchema7 & JSONObject },
            },
          }),
        ),
        responseFormat: { type: "json", name: "result", schema },
      };
      const before = structuredClone(params);
      await expect(
        openaiCompatibleAdapter
          .createChatModel(config, "test-model")
          [method](params),
      ).rejects.toThrow("captured request");
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const wire = JSON.parse(String(fetchMock.mock.calls[0][1].body));
      expect(wire.tools.map((tool: { name: string }) => tool.name)).toEqual([
        "mcp_catalog",
        "builtin_action",
        "custom_action",
      ]);
      for (const tool of wire.tools) {
        expect(tool.parameters.required).toEqual(["map0"]);
        expect(tool.parameters.additionalProperties).toBe(false);
        expect(tool.parameters.properties.map0).toEqual({
          type: "object",
          additionalProperties: { type: "string" },
        });
        expect(tool.output_schema.properties.map0).not.toHaveProperty(
          "propertyNames",
        );
      }
      expect(wire.text.format.schema.properties.map0).not.toHaveProperty(
        "propertyNames",
      );
      expect(params).toEqual(before);
    },
  );

  it("visits schema positions without rewriting literal data or property names", () => {
    const leaf = mapSchema({ enum: ["color"] });
    const data = { propertyNames: { enum: ["literal"] } };
    const schema: JSONSchema7 = {
      properties: { propertyNames: leaf },
      patternProperties: { "^x": leaf },
      definitions: { leaf },
      $defs: { leaf },
      items: [leaf],
      additionalItems: leaf,
      additionalProperties: leaf,
      contains: leaf,
      not: leaf,
      if: leaf,
      then: leaf,
      else: leaf,
      allOf: [leaf],
      anyOf: [leaf],
      oneOf: [leaf],
      dependencies: { object: leaf, names: ["a", "b"] },
      default: data,
      const: data,
      enum: [data],
      examples: [data],
    };
    const before = structuredClone(schema);
    const result = explicitPropertyNameTypes(schema);
    const typedLeaf = {
      ...leaf,
      propertyNames: { type: "string", allOf: [leaf.propertyNames] },
    };
    expect(result.properties?.propertyNames).toEqual(typedLeaf);
    expect(result.patternProperties?.["^x"]).toEqual(typedLeaf);
    expect(result.definitions?.leaf).toEqual(typedLeaf);
    expect(result.$defs?.leaf).toEqual(typedLeaf);
    for (const key of [
      "additionalItems",
      "additionalProperties",
      "contains",
      "not",
      "if",
      "then",
      "else",
    ] as const)
      expect(result[key]).toEqual(typedLeaf);
    for (const key of ["items", "allOf", "anyOf", "oneOf"] as const)
      expect(result[key]).toEqual([typedLeaf]);
    expect(result.dependencies).toEqual({
      object: typedLeaf,
      names: ["a", "b"],
    });
    for (const key of ["default", "const", "enum", "examples"] as const)
      expect(result[key]).toEqual(schema[key]);
    expect(schema).toEqual(before);
  });
});
