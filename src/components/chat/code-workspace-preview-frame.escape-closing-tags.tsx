"use client";


import type { CodeWorkspaceArtifact } from "@/components/chat/chat-types";

export function escapeClosingTags(value: string) {
  return value
    .replace(/<\/script/gi, "<\\/script")
    .replace(/<\/style/gi, "<\\/style");
}

function codeWorkspaceFileUrl(projectId: string, filePath: string) {
  return `/api/workspace/code-projects/${projectId}/files?path=${encodeURIComponent(filePath)}`;
}

function dirnamePath(filePath: string) {
  const slashIndex = filePath.lastIndexOf("/");
  return slashIndex === -1 ? "" : filePath.slice(0, slashIndex);
}

export function normalizeWorkspaceHref(fromPath: string, href: string) {
  if (
    !href ||
    href.startsWith("#") ||
    /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(href)
  ) {
    return null;
  }
  const cleanHref = href.split("#")[0]?.split("?")[0] ?? "";
  const parts = [
    ...dirnamePath(fromPath).split("/"),
    ...cleanHref.split("/"),
  ].filter(Boolean);
  const normalized: string[] = [];
  for (const part of parts) {
    if (part === ".") continue;
    if (part === "..") {
      normalized.pop();
      continue;
    }
    normalized.push(part);
  }
  const path = normalized.join("/");
  return path && !path.endsWith("/") ? path : `${path}index.html`;
}

export function metaRefreshTarget(html: string, fromPath: string) {
  const metaTag = html.match(
    /<meta\b[^>]*http-equiv=["']?refresh["']?[^>]*>/i,
  )?.[0];
  if (!metaTag) return null;
  const urlMatch = metaTag.match(/url\s*=\s*([^;"'>\s]+)/i);
  return urlMatch?.[1]
    ? normalizeWorkspaceHref(fromPath, urlMatch[1].trim())
    : null;
}

function stripMetaRefresh(html: string) {
  return html.replace(/<meta\b[^>]*http-equiv=["']?refresh["']?[^>]*>/gi, "");
}

function isPreviewTokenSegment(value: string | undefined) {
  return Boolean(
    value &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    ),
  );
}

function previewRoutePrefix(artifact: CodeWorkspaceArtifact) {
  const marker = `/api/workspace/code-projects/${artifact.projectId}/preview`;
  const rawPreviewUrl = artifact.previewUrl?.split("?")[0] ?? marker;
  const markerIndex = rawPreviewUrl.indexOf(marker);
  if (markerIndex === -1) return marker;
  const suffix = rawPreviewUrl.slice(markerIndex + marker.length);
  const firstSegment = suffix.split("/").filter(Boolean)[0];
  return isPreviewTokenSegment(firstSegment)
    ? `${marker}/${firstSegment}`
    : marker;
}

function absolutePreviewUrl(path: string) {
  if (typeof window === "undefined") return path;
  return new URL(path, window.location.origin).toString();
}

function previewBaseHref(artifact: CodeWorkspaceArtifact, filePath: string) {
  const directory = dirnamePath(filePath);
  return absolutePreviewUrl(
    `${previewRoutePrefix(artifact)}${directory ? `/${directory}` : ""}/`,
  );
}

function previewSrcDocCsp() {
  const origin =
    typeof window === "undefined" ? "'self'" : window.location.origin;
  return [
    "default-src 'none'",
    "script-src 'unsafe-inline' 'unsafe-eval'",
    "style-src 'unsafe-inline'",
    `img-src ${origin} data: blob:`,
    `font-src ${origin} data:`,
    `media-src ${origin} data: blob:`,
    "connect-src 'none'",
    "frame-src 'none'",
    "object-src 'none'",
    `base-uri ${origin}`,
    "form-action 'none'",
  ].join("; ");
}

function injectPreviewSecurityHead(
  html: string,
  artifact: CodeWorkspaceArtifact,
  path: string,
) {
  const baseTag = `<base href="${previewBaseHref(artifact, path)}" />`;
  const cspTag = `<meta http-equiv="Content-Security-Policy" content="${escapeHtmlAttribute(previewSrcDocCsp())}" />`;
  const headTags = `${cspTag}${baseTag}`;
  if (/<head\b[^>]*>/i.test(html)) {
    return html.replace(/<head\b([^>]*)>/i, `<head$1>${headTags}`);
  }
  return `${headTags}${html}`;
}

function injectPreviewNavigationBridge(
  html: string,
  artifact: CodeWorkspaceArtifact,
  path: string,
) {
  const bridgeScript = `<script>(()=>{const projectId=${JSON.stringify(artifact.projectId)};const currentPath=${JSON.stringify(path)};function resolveLocal(href){try{if(!href||href.startsWith('#')||/^(mailto|tel|javascript):/i.test(href))return null;const url=new URL(href,'https://workspace.local/'+currentPath);if(url.origin!=='https://workspace.local')return null;let path=decodeURIComponent(url.pathname.replace(/^\\//,''));if(!path||path.endsWith('/'))path+='index.html';return path;}catch{return null;}}document.addEventListener('click',event=>{const target=event.target&&event.target.closest?event.target.closest('a[href]'):null;if(!target||target.target==='_blank'||target.hasAttribute('download'))return;const path=resolveLocal(target.getAttribute('href')||'');if(!path)return;event.preventDefault();window.parent.postMessage({type:'code-workspace-preview:navigate',projectId,path},'*');},true);})();</script>`;
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${bridgeScript}</body>`);
  }
  return `${html}${bridgeScript}`;
}

export function buildPreviewSrcDoc(
  html: string,
  artifact: CodeWorkspaceArtifact,
  path: string,
) {
  return injectPreviewNavigationBridge(
    injectPreviewSecurityHead(stripMetaRefresh(html), artifact, path),
    artifact,
    path,
  );
}

export async function fetchCodeWorkspaceTextFile(projectId: string, filePath: string) {
  const response = await fetch(codeWorkspaceFileUrl(projectId, filePath));
  const data = (await response.json().catch(() => null)) as {
    content?: string;
    error?: string;
  } | null;
  if (!response.ok || typeof data?.content !== "string") {
    throw new Error(data?.error || "Failed to load file");
  }
  return data.content;
}

const HTML_ATTRIBUTE_PATTERNS = {
  href: /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i,
  media: /\bmedia\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i,
  rel: /\brel\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i,
  src: /\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i,
} as const;

export function htmlAttributeValue(
  tag: string,
  name: keyof typeof HTML_ATTRIBUTE_PATTERNS,
) {
  const match = tag.match(HTML_ATTRIBUTE_PATTERNS[name]);
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? null;
}

export function escapeHtmlAttribute(value: string) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

export async function replacePreviewMatches(
  value: string,
  pattern: RegExp,
  replacer: (match: RegExpMatchArray) => Promise<string>,
) {
  let result = "";
  let cursor = 0;
  for (const match of value.matchAll(pattern)) {
    const index = match.index ?? cursor;
    result += value.slice(cursor, index);
    result += await replacer(match);
    cursor = index + match[0].length;
  }
  return `${result}${value.slice(cursor)}`;
}

export function hasWorkspaceTextFile(
  files: CodeWorkspaceArtifact["files"],
  path: string,
) {
  return files.some((file) => file.path === path && !file.binary);
}
