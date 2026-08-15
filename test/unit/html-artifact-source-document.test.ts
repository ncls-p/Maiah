import { describe, expect, it } from "vitest";

import {
  artifactSourceDocument,
  isFullHtmlDocument,
} from "@/components/chat/chat-message-rendering-utils.artifact-source-document";
import type { HtmlArtifactOutput } from "@/components/chat/chat-message-rendering-utils";

function artifact(
  overrides: Partial<HtmlArtifactOutput> = {},
): HtmlArtifactOutput {
  return {
    kind: "html_artifact",
    title: "Preview",
    html: "<p>Hi</p>",
    css: "",
    js: "",
    height: 420,
    ...overrides,
  };
}

describe("html artifact source document", () => {
  it("detects a full HTML document from the model", () => {
    expect(
      isFullHtmlDocument("<!DOCTYPE html><html><body>charts</body></html>"),
    ).toBe(true);
    expect(isFullHtmlDocument("<html lang='fr'><body></body></html>")).toBe(
      true,
    );
    expect(isFullHtmlDocument("<div class='card'></div>")).toBe(false);
  });

  it("does not nest a full document inside another body", () => {
    const srcDoc = artifactSourceDocument(
      artifact({
        html: `<!DOCTYPE html>
<html lang="fr">
<head><title>Benchmarks</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
</head>
<body>
<canvas id="coding"></canvas>
<script>new Chart(document.getElementById('coding'), { type: 'bar' })</script>
</body>
</html>`,
      }),
    );

    expect(srcDoc).toMatch(/^<!DOCTYPE html>/i);
    expect(srcDoc).not.toMatch(/<body>\s*<!DOCTYPE html>/i);
    expect(srcDoc).toContain('src="https://cdn.jsdelivr.net/npm/chart.js"');
    expect(srcDoc).toContain("new Chart(");
  });

  it("allows HTTPS scripts so CDN chart libraries can run", () => {
    const srcDoc = artifactSourceDocument(artifact());
    expect(srcDoc).toContain("script-src 'unsafe-inline' 'unsafe-eval' https:");
    expect(srcDoc).toContain("style-src 'unsafe-inline' https:");
  });

  it("still wraps HTML fragments and keeps extra JS", () => {
    const srcDoc = artifactSourceDocument(
      artifact({
        html: "<canvas id='chart'></canvas>",
        js: "draw()",
      }),
    );
    expect(srcDoc).toContain("<body>\n<canvas id='chart'></canvas>");
    expect(srcDoc).toContain("draw()");
  });

  it("injects CSS and JS fields into a full document", () => {
    const srcDoc = artifactSourceDocument(
      artifact({
        html: "<!doctype html><html><head></head><body><p>Hi</p></body></html>",
        css: ".card { color: red; }",
        js: "setup()",
      }),
    );
    expect(srcDoc).toContain(".card { color: red; }");
    expect(srcDoc).toContain("setup()");
    expect(srcDoc.indexOf("setup()")).toBeLessThan(srcDoc.indexOf("</body>"));
  });
});
