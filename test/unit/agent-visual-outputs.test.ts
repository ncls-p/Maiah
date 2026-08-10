import { collectAgentVisualOutputs } from "@/modules/agent/runtime-executor.visual-outputs";
import { describe, expect, it } from "vitest";

describe("agent visual output promotion", () => {
  it("collects publishable artifacts without treating plain tool data as visual", () => {
    const outputs = collectAgentVisualOutputs([
      { toolName: "web_search", output: { results: ["one"] } },
      {
        toolName: "render_html_artifact",
        output: {
          kind: "html_artifact",
          title: "Release chart",
          html: "<main />",
          css: "",
          js: "",
          height: 420,
        },
      },
    ]);

    expect(outputs).toHaveLength(1);
    expect(outputs[0]).toMatchObject({
      toolName: "render_html_artifact",
      kind: "html_artifact",
      title: "Release chart",
    });
  });

  it("only promotes sandbox results that produced or modified a file", () => {
    const base = {
      kind: "code_sandbox_result",
      ok: true,
      language: "python",
      files: [],
    };
    expect(
      collectAgentVisualOutputs([
        { toolName: "run_code_sandbox", output: base },
      ]),
    ).toHaveLength(0);
    expect(
      collectAgentVisualOutputs([
        {
          toolName: "run_code_sandbox",
          output: {
            ...base,
            files: [
              {
                path: "chart.png",
                size: 120,
                mimeType: "image/png",
                fromInput: false,
              },
            ],
          },
        },
      ]),
    ).toHaveLength(1);
  });
});
