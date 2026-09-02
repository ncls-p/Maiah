"use client";

import type React from "react";
import { useEffect, useMemo, useState } from "react";

import { highlightCode } from "./code-workspace-artifact-card.highlight-code";
import {
  CODE_WORKSPACE_HIGHLIGHT_MAX_CHARS,
  codeWorkspaceLanguage,
  type CodeWorkspaceTokenLine,
} from "./code-workspace-artifact-card.language";

// Shiki (grammars + engine) is only downloaded once a file is actually opened
// in the editor, so it never weighs on the chat page itself.
const loadShiki = () => import("./code-workspace-artifact-card.shiki");

type TokenStyle = React.CSSProperties & {
  "--code-light"?: string;
  "--shiki-dark"?: string;
};

function tokenStyle(token: CodeWorkspaceTokenLine[number]): TokenStyle {
  const style: TokenStyle = {};
  const htmlStyle = token.htmlStyle ?? {};
  const light = htmlStyle.color ?? token.color;
  if (light) style["--code-light"] = light;
  const dark = htmlStyle["--shiki-dark"];
  if (dark) style["--shiki-dark"] = dark;
  if (token.fontStyle && token.fontStyle & 1) style.fontStyle = "italic";
  if (token.fontStyle && token.fontStyle & 2) style.fontWeight = 600;
  return style;
}

/**
 * Renders Shiki tokens as inline spans whose text is byte-for-byte the source,
 * so the highlight layer lines up exactly with the transparent textarea.
 */
export function renderCodeWorkspaceTokens(lines: CodeWorkspaceTokenLine[]) {
  const nodes: React.ReactNode[] = [];
  lines.forEach((line, lineIndex) => {
    if (lineIndex > 0) nodes.push("\n");
    line.forEach((token, tokenIndex) => {
      nodes.push(
        <span
          key={`${lineIndex}-${tokenIndex}`}
          className="text-[var(--code-light,inherit)] dark:text-[var(--shiki-dark,var(--code-light,inherit))]"
          style={tokenStyle(token)}
        >
          {token.content}
        </span>,
      );
    });
  });
  return nodes.length > 0 ? nodes : " ";
}

/**
 * Syntax colours for every file type in the code workspace editor. Shiki
 * grammars load lazily; until then (or for unknown/huge files) the lightweight
 * regex highlighter keeps HTML/CSS/JS readable.
 */
export function useCodeWorkspaceHighlight(
  value: string,
  filePath: string | null,
) {
  const language = useMemo(() => codeWorkspaceLanguage(filePath), [filePath]);
  const [tokens, setTokens] = useState<{
    language: string;
    value: string;
    lines: CodeWorkspaceTokenLine[];
  } | null>(null);

  useEffect(() => {
    if (!language || value.length > CODE_WORKSPACE_HIGHLIGHT_MAX_CHARS) {
      return;
    }
    let cancelled = false;
    loadShiki()
      .then(({ tokenizeCodeWorkspaceFile }) =>
        tokenizeCodeWorkspaceFile(value, language),
      )
      .then((lines) => {
        if (!cancelled) setTokens({ language, value, lines });
      })
      .catch(() => {
        // Keep the regex fallback when a grammar cannot be loaded.
      });
    return () => {
      cancelled = true;
    };
  }, [language, value]);

  return useMemo(() => {
    if (tokens && tokens.language === language && tokens.value === value) {
      return renderCodeWorkspaceTokens(tokens.lines);
    }
    return highlightCode(value, filePath);
  }, [filePath, language, tokens, value]);
}
