"use client";

import type React from "react";

import type { CodeWorkspaceArtifact } from "@/components/chat/chat-types";

function highlightWithRegex(value: string, pattern: RegExp, classify: (token: string) => string | null) {
  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  let tokenIndex = 0;
  for (const match of value.matchAll(pattern)) {
    const index = match.index ?? cursor;
    const token = match[0];
    if (index > cursor) nodes.push(value.slice(cursor, index));
    const color = classify(token);
    if (color) {
      nodes.push(
        <span key={`${index}-${tokenIndex}`} style={{ color }}>
          {token}
        </span>,
      );
    } else {
      nodes.push(token);
    }
    cursor = index + token.length;
    tokenIndex += 1;
  }
  if (cursor < value.length) nodes.push(value.slice(cursor));
  return nodes.length > 0 ? nodes : " ";
}

const CODE_TOKEN_COLORS = {
  comment: "#6b7280",
  keyword: "#2563eb",
  property: "#9333ea",
  string: "#16a34a",
  number: "#ea580c",
  color: "#dc2626",
} as const;

type CodeHighlightConfig = {
  pattern: RegExp;
  classify: (token: string) => string | null;
};

const isQuotedToken = (token: string) => ['"', "'", "`"].some((quote) => token.startsWith(quote));

const CODE_HIGHLIGHTERS: Record<string, CodeHighlightConfig> = {
  html: {
    pattern: /<!--[\s\S]*?-->|<\/?[\w:-]+\b|\/?>|\b[\w:-]+(?=\=)|"[^"]*"|'[^']*'/g,
    classify: (token) => {
      if (token.startsWith("<!--")) return CODE_TOKEN_COLORS.comment;
      if (token.startsWith("<") || token === ">" || token === "/>") {
        return CODE_TOKEN_COLORS.keyword;
      }
      return isQuotedToken(token) ? CODE_TOKEN_COLORS.string : CODE_TOKEN_COLORS.property;
    },
  },
  css: {
    pattern: /\/\*[\s\S]*?\*\/|#[\da-fA-F]{3,8}\b|\b[a-zA-Z-]+(?=\s*:)|"[^"]*"|'[^']*'|\b\d+(?:\.\d+)?(?:px|rem|em|%|vh|vw)?\b/g,
    classify: (token) => {
      if (token.startsWith("/*")) return CODE_TOKEN_COLORS.comment;
      if (token.startsWith("#")) return CODE_TOKEN_COLORS.color;
      if (isQuotedToken(token)) return CODE_TOKEN_COLORS.string;
      return /^\d/.test(token) ? CODE_TOKEN_COLORS.number : CODE_TOKEN_COLORS.property;
    },
  },
  js: {
    pattern: /\/\*[\s\S]*?\*\/|\/\/[^\n]*|`(?:\\.|[^`])*`|"(?:\\.|[^"])*"|'(?:\\.|[^'])*'|\b(?:const|let|var|function|return|if|else|for|while|class|import|export|from|async|await|new|true|false|null|undefined)\b|\b\d+(?:\.\d+)?\b/g,
    classify: (token) => {
      if (token.startsWith("/*") || token.startsWith("//")) {
        return CODE_TOKEN_COLORS.comment;
      }
      if (isQuotedToken(token)) return CODE_TOKEN_COLORS.string;
      return /^\d/.test(token) ? CODE_TOKEN_COLORS.number : CODE_TOKEN_COLORS.keyword;
    },
  },
};

const CODE_HIGHLIGHTER_ALIASES: Record<string, string> = {
  htm: "html",
  xml: "html",
  svg: "html",
  mjs: "js",
  cjs: "js",
  json: "js",
};

export function highlightCode(value: string, filePath: string | null) {
  const extension = filePath?.split(".").pop()?.toLowerCase() ?? "";
  const highlighterKey = CODE_HIGHLIGHTER_ALIASES[extension] ?? extension;
  const highlighter = CODE_HIGHLIGHTERS[highlighterKey];

  return highlighter ? highlightWithRegex(value, highlighter.pattern, highlighter.classify) : value || " ";
}

export type CodeWorkspaceTreeNode = {
  name: string;
  path: string;
  type: "directory" | "file";
  file?: CodeWorkspaceArtifact["files"][number];
  children: CodeWorkspaceTreeNode[];
};

export function buildCodeWorkspaceTree(files: CodeWorkspaceArtifact["files"]) {
  const root: CodeWorkspaceTreeNode = {
    name: "",
    path: "",
    type: "directory",
    children: [],
  };
  const matchesNode = (item: CodeWorkspaceTreeNode, part: string, expectedType: "file" | "directory") => item.name === part && item.type === expectedType;
  const findChild = (children: CodeWorkspaceTreeNode[], part: string, type: "file" | "directory") => {
    for (const item of children) {
      if (matchesNode(item, part, type)) return item;
    }
    return undefined;
  };
  for (const file of files) {
    const parts = file.path.split("/").filter(Boolean);
    let current = root;
    for (let pi = 0; pi < parts.length; pi++) {
      const part = parts[pi];
      const isFile = pi === parts.length - 1;
      const nodePath = parts.slice(0, pi + 1).join("/");
      let child = findChild(current.children, part, isFile ? "file" : "directory");
      if (!child) {
        child = {
          name: part,
          path: nodePath,
          type: isFile ? "file" : "directory",
          file: isFile ? file : undefined,
          children: [],
        };
        current.children.push(child);
      }
      current = child;
    }
  }
  const sortNodes = (nodes: CodeWorkspaceTreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    nodes.forEach((node) => sortNodes(node.children));
  };
  sortNodes(root.children);
  return root.children;
}
