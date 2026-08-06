import { describe,expect,it,vi } from "vitest";

import { invokeNode } from "./workflow-runtime-coverage.test.dependencies";

describe("workflow data nodes", () => {
  it("reads the trigger and resolves nested data templates", async () => {
    await expect(
      invokeNode(
        "trigger.manual",
        undefined,
        {},
        {
          context: { get: vi.fn().mockResolvedValue({ name: "Ada" }) },
        },
      ),
    ).resolves.toEqual({ output: { name: "Ada" } });

    await expect(
      invokeNode(
        "data.set",
        { name: "Ada", nested: { count: 2 } },
        {
          values: {
            "": "ignored",
            greeting: "Bonjour {{name}}",
            exact: "{{nested}}",
            list: ["{{name}}", { value: "{{nested.count}}" }],
            missing: "{{unknown}}",
          },
        },
      ),
    ).resolves.toEqual({
      output: {
        name: "Ada",
        nested: { count: 2 },
        greeting: "Bonjour Ada",
        exact: { count: 2 },
        list: ["Ada", { value: 2 }],
        missing: undefined,
      },
    });
  });

  it("picks, removes, renames, and templates nested fields", async () => {
    const input = {
      profile: { name: "Ada", secret: true },
      untouched: 1,
    };
    await expect(
      invokeNode("data.pick", input, {
        paths: ["profile.name", "missing"],
      }),
    ).resolves.toEqual({ output: { profile: { name: "Ada" } } });
    await expect(invokeNode("data.pick", input, { paths: "invalid" })).resolves.toEqual({ output: {} });
    await expect(invokeNode("data.remove", input, { paths: ["profile.secret"] })).resolves.toEqual({
      output: { profile: { name: "Ada" }, untouched: 1 },
    });
    await expect(invokeNode("data.remove", input, { paths: null })).resolves.toEqual({ output: input });
    await expect(
      invokeNode("data.rename", input, {
        from: "profile.name",
        to: "identity.displayName",
      }),
    ).resolves.toEqual({
      output: {
        profile: { secret: true },
        identity: { displayName: "Ada" },
        untouched: 1,
      },
    });
    await expect(invokeNode("data.rename", input, { from: "missing", to: "new" })).resolves.toEqual({ output: input });
    await expect(
      invokeNode("data.template", input, {
        template: "{{input}}",
        outputPath: "",
      }),
    ).resolves.toEqual({ output: input });
  });

  it("rejects field paths that access object prototypes", async () => {
    await expect(
      invokeNode(
        "data.rename",
        { value: "unsafe" },
        {
          from: "value",
          to: "__proto__.polluted",
        },
      ),
    ).rejects.toThrow("cannot access object prototypes");
    await expect(
      invokeNode(
        "data.pick",
        { value: "unsafe" },
        {
          paths: ["constructor.prototype.polluted"],
        },
      ),
    ).rejects.toThrow("cannot access object prototypes");
    expect((Object.prototype as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("parses and serializes JSON with useful failures", async () => {
    await expect(
      invokeNode(
        "data.parseJson",
        { raw: '{"value":1}' },
        {
          path: "raw",
          outputPath: "parsed",
        },
      ),
    ).resolves.toEqual({
      output: { raw: '{"value":1}', parsed: { value: 1 } },
    });
    await expect(
      invokeNode(
        "data.parseJson",
        { raw: 1 },
        {
          path: "raw",
          outputPath: "parsed",
        },
      ),
    ).rejects.toThrow("must be text");
    await expect(
      invokeNode(
        "data.parseJson",
        { raw: "{" },
        {
          path: "raw",
          outputPath: "parsed",
        },
      ),
    ).rejects.toThrow("valid JSON");
    await expect(
      invokeNode(
        "data.stringifyJson",
        { parsed: { value: 1 } },
        {
          path: "parsed",
          outputPath: "json",
        },
      ),
    ).resolves.toEqual({
      output: { parsed: { value: 1 }, json: '{"value":1}' },
    });
  });
});
