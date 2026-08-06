import { builtInToolInputSchemaJson } from "@/modules/tool/builtin-tool-json-schema";
import { imageGenerationInputSchema } from "@/modules/tool/builtin-tool-primitives";
import { BUILTIN_TOOL_SUMMARIES } from "@/modules/tool/builtin-tools-catalog";
import { describe,expect,it } from "vitest";

describe("image generation tool", () => {
  it("is available as an administrator-bindable built-in tool", () => {
    expect(BUILTIN_TOOL_SUMMARIES.find((tool) => tool.name === "generate_image")).toMatchObject({
      riskLevel: "medium",
      category: "Create",
    });
  });

  it("requires a prompt and validates optional dimensions", () => {
    expect(
      imageGenerationInputSchema.safeParse({
        prompt: "A quiet forest at sunrise",
        size: "1024x1024",
      }).success,
    ).toBe(true);
    expect(
      imageGenerationInputSchema.safeParse({
        prompt: "A quiet forest",
        size: "large",
      }).success,
    ).toBe(false);
  });

  it("publishes the same input contract to model tool schemas", () => {
    expect(builtInToolInputSchemaJson("generate_image")).toMatchObject({
      type: "object",
      required: ["prompt"],
    });
  });
});
