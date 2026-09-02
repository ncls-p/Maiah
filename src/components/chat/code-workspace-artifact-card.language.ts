import type { BundledLanguage, ThemedToken } from "shiki";

// Type-only imports: this module maps file names to grammars without pulling
// Shiki into the chat bundle. The highlighter itself is loaded on demand from
// `code-workspace-artifact-card.shiki.ts`.

/** Above this size the editor falls back to the lightweight highlighter. */
export const CODE_WORKSPACE_HIGHLIGHT_MAX_CHARS = 200_000;

export type CodeWorkspaceTokenLine = ThemedToken[];

const LANGUAGE_BY_EXTENSION: Record<string, BundledLanguage> = {
  astro: "astro",
  bash: "shellscript",
  bat: "bat",
  c: "c",
  cjs: "javascript",
  cmake: "cmake",
  cpp: "cpp",
  cs: "csharp",
  css: "css",
  csv: "csv",
  cts: "typescript",
  dart: "dart",
  diff: "diff",
  dockerfile: "docker",
  env: "dotenv",
  ex: "elixir",
  exs: "elixir",
  go: "go",
  gql: "graphql",
  graphql: "graphql",
  groovy: "groovy",
  h: "c",
  hbs: "handlebars",
  hcl: "hcl",
  hpp: "cpp",
  htm: "html",
  html: "html",
  ini: "ini",
  java: "java",
  js: "javascript",
  json: "json",
  json5: "json5",
  jsonc: "jsonc",
  jsx: "jsx",
  kt: "kotlin",
  kts: "kotlin",
  less: "less",
  lua: "lua",
  m: "objective-c",
  markdown: "markdown",
  md: "markdown",
  mdx: "mdx",
  mjs: "javascript",
  mk: "make",
  mts: "typescript",
  nix: "nix",
  patch: "diff",
  php: "php",
  pl: "perl",
  prisma: "prisma",
  proto: "proto",
  ps1: "powershell",
  pug: "pug",
  py: "python",
  r: "r",
  rb: "ruby",
  rs: "rust",
  sass: "sass",
  scala: "scala",
  scss: "scss",
  sh: "shellscript",
  sol: "solidity",
  sql: "sql",
  svelte: "svelte",
  svg: "xml",
  swift: "swift",
  tex: "latex",
  tf: "terraform",
  toml: "toml",
  ts: "typescript",
  tsx: "tsx",
  vb: "vb",
  vue: "vue",
  webmanifest: "json",
  xml: "xml",
  yaml: "yaml",
  yml: "yaml",
  zig: "zig",
  zsh: "shellscript",
};

const LANGUAGE_BY_FILENAME: Record<string, BundledLanguage> = {
  ".babelrc": "json",
  ".env": "dotenv",
  ".eslintrc": "json",
  ".gitignore": "ini",
  ".npmrc": "ini",
  ".prettierrc": "json",
  cmakelists: "cmake",
  dockerfile: "docker",
  makefile: "make",
  procfile: "shellscript",
};

/** Maps a workspace file path to the Shiki grammar that should colour it. */
export function codeWorkspaceLanguage(
  filePath: string | null,
): BundledLanguage | null {
  if (!filePath) return null;
  const fileName = filePath.split("/").pop()?.toLowerCase() ?? "";
  const byName =
    LANGUAGE_BY_FILENAME[fileName] ??
    LANGUAGE_BY_FILENAME[fileName.replace(/\.[^.]+$/u, "")];
  if (byName) return byName;
  const extension = fileName.includes(".") ? fileName.split(".").pop() : "";
  return (extension && LANGUAGE_BY_EXTENSION[extension]) || null;
}
