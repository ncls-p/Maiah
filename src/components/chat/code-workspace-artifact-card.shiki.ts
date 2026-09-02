"use client";

import {
  createHighlighter,
  type BundledLanguage,
  type BundledTheme,
  type HighlighterGeneric,
} from "shiki";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";

import type { CodeWorkspaceTokenLine } from "./code-workspace-artifact-card.language";

export const CODE_WORKSPACE_LIGHT_THEME = "github-light";
export const CODE_WORKSPACE_DARK_THEME = "github-dark";

type CodeWorkspaceHighlighter = HighlighterGeneric<
  BundledLanguage,
  BundledTheme
>;

const engine = createJavaScriptRegexEngine({ forgiving: true });
const highlighters = new Map<string, Promise<CodeWorkspaceHighlighter>>();

function highlighterFor(language: BundledLanguage) {
  const cached = highlighters.get(language);
  if (cached) return cached;
  const created = createHighlighter({
    themes: [CODE_WORKSPACE_LIGHT_THEME, CODE_WORKSPACE_DARK_THEME],
    langs: [language],
    engine,
  }).catch((error: unknown) => {
    highlighters.delete(language);
    throw error;
  });
  highlighters.set(language, created);
  return created;
}

/**
 * Tokenises a file with both the light and dark theme so the editor can switch
 * colours with the app theme through CSS variables.
 */
export async function tokenizeCodeWorkspaceFile(
  code: string,
  language: BundledLanguage,
): Promise<CodeWorkspaceTokenLine[]> {
  const highlighter = await highlighterFor(language);
  return highlighter.codeToTokens(code, {
    lang: language,
    themes: {
      light: CODE_WORKSPACE_LIGHT_THEME,
      dark: CODE_WORKSPACE_DARK_THEME,
    },
  }).tokens;
}
