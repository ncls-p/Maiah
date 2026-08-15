import type { HtmlArtifactOutput } from "./chat-message-rendering-utils.stringify-for-match";

const ARTIFACT_PREVIEW_CSP = [
  "default-src 'none'",
  "img-src data: blob: https:",
  "font-src data: https:",
  "style-src 'unsafe-inline' https:",
  "script-src 'unsafe-inline' 'unsafe-eval' https:",
  "connect-src 'none'",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

function escapeClosingTags(value: string) {
  return value.replace(/<\/(script|style)/gi, "<\\/$1");
}

export function isFullHtmlDocument(html: string) {
  return /^\s*(?:<!--[\s\S]*?-->\s*)*(?:<!doctype\s+html\b|<html[\s>])/i.test(
    html,
  );
}

function previewHeadTags(css: string, fullscreenCss: string) {
  return `<meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><meta http-equiv="Content-Security-Policy" content="${ARTIFACT_PREVIEW_CSP}" /><style>
:root { color-scheme: light dark; }
* { box-sizing: border-box; }
html, body { margin: 0; min-height: 100%; }
body { font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
${escapeClosingTags(css)}
${fullscreenCss}
</style>`;
}

function injectIntoHead(html: string, tags: string) {
  if (/<head\b[^>]*>/i.test(html)) {
    return html.replace(/<head\b[^>]*>/i, (open) => `${open}${tags}`);
  }
  if (/<html\b[^>]*>/i.test(html)) {
    return html.replace(
      /<html\b[^>]*>/i,
      (open) => `${open}<head>${tags}</head>`,
    );
  }
  return `<head>${tags}</head>${html}`;
}

function appendBeforeBodyClose(html: string, snippet: string) {
  if (!snippet) return html;
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${snippet}</body>`);
  }
  return `${html}${snippet}`;
}

export function artifactSourceDocument(
  artifact: HtmlArtifactOutput,
  options: { fullscreen?: boolean } = {},
) {
  const fullscreenCss = options.fullscreen
    ? `
html, body { width: 100%; min-height: 100%; }
body { overflow: auto; }
body > .container,
body > .grid,
body > main,
body > section,
body > article,
body > div:first-child {
	width: 100% !important;
	max-width: none !important;
}
body > .container,
body > main,
body > section,
body > article,
body > div:first-child {
	min-height: 100dvh;
}
`
    : "";
  const headTags = previewHeadTags(artifact.css, fullscreenCss);
  const extraScript = artifact.js.trim()
    ? `<script>\n${escapeClosingTags(artifact.js)}\n</script>`
    : "";

  if (isFullHtmlDocument(artifact.html)) {
    return appendBeforeBodyClose(
      injectIntoHead(artifact.html, headTags),
      extraScript,
    );
  }

  return `<!doctype html>
<html>
<head>
${headTags}
</head>
<body>
${artifact.html}
${extraScript}
</body>
</html>`;
}

export function artifactCombinedCode(artifact: HtmlArtifactOutput) {
  return `<style>\n${artifact.css}\n</style>\n\n${artifact.html}\n\n<script>\n${artifact.js}\n</script>`;
}
