import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import type { CodeWorkspaceArtifact } from "@/components/chat/chat-types";
import {
  codeWorkspaceWindowUrl,
  initialCodeWorkspacePath,
} from "@/components/chat/code-workspace-artifact-card.button-type";
import { codeWorkspaceLanguage } from "@/components/chat/code-workspace-artifact-card.language";

const artifact: CodeWorkspaceArtifact = {
  kind: "code_workspace_artifact",
  projectId: "0f7d9d6a-4f2e-4f7c-9b1e-2d1c3b4a5e6f",
  title: "demo",
  rootFile: "index.html",
  version: 3,
  previewUrl: "/api/workspace/code-projects/x/preview/token/index.html",
  downloadUrl: "/api/workspace/code-projects/x/download",
  files: [
    file("index.html", "text/html"),
    file("logo.png", "image/png", true),
    file("models/storage_model.ts", "text/typescript"),
  ],
};

function file(path: string, mimeType: string, binary = false) {
  return {
    path,
    size: 10,
    mimeType,
    binary,
    hash: `hash-${path}`,
    updatedAt: "2026-09-02T00:00:00.000Z",
  };
}

describe("code workspace pop-out windows", () => {
  it("builds workbench and preview pop-out urls scoped to the locale", () => {
    expect(codeWorkspaceWindowUrl("fr", artifact)).toBe(
      `/fr/code-workspace/${artifact.projectId}`,
    );
    expect(
      codeWorkspaceWindowUrl("en", artifact, {
        workspaceId: "ws-1",
        path: "models/storage_model.ts",
      }),
    ).toBe(
      `/en/code-workspace/${artifact.projectId}?workspaceId=ws-1&path=models%2Fstorage_model.ts`,
    );
    expect(
      codeWorkspaceWindowUrl("fr", artifact, {
        surface: "preview",
        workspaceId: "ws-1",
      }),
    ).toBe(`/fr/code-workspace/${artifact.projectId}/preview?workspaceId=ws-1`);
  });

  it("opens the requested text file, falling back to the html entry", () => {
    expect(initialCodeWorkspacePath(artifact, "models/storage_model.ts")).toBe(
      "models/storage_model.ts",
    );
    expect(initialCodeWorkspacePath(artifact, "logo.png")).toBe("index.html");
    expect(initialCodeWorkspacePath(artifact, "missing.ts")).toBe("index.html");
    expect(
      initialCodeWorkspacePath({ ...artifact, rootFile: null }, null),
    ).toBe("index.html");
    expect(
      initialCodeWorkspacePath({ ...artifact, rootFile: null, files: [] }),
    ).toBeNull();
  });

  it("pops the preview out through an app page so sandboxed assets stay authenticated", () => {
    const source = fs.readFileSync(
      path.join(
        process.cwd(),
        "src/components/chat/code-workspace-artifact-card.use-popout-windows.ts",
      ),
      "utf8",
    );
    const windowSource = fs.readFileSync(
      path.join(process.cwd(), "src/components/chat/code-workspace-window.tsx"),
      "utf8",
    );
    expect(source).toContain('surface: "preview"');
    expect(source).not.toContain("artifact.previewUrl,");
    expect(windowSource).toContain("CodeWorkspacePreviewFrame");
    expect(windowSource).toContain("subscribeToCodeWorkspaceArtifacts");
  });
});

describe("code workspace syntax colours", () => {
  it("maps every supported workspace file type to a Shiki grammar", () => {
    const expectations: Record<string, string> = {
      "index.html": "html",
      "styles.css": "css",
      "app.js": "javascript",
      "app.mjs": "javascript",
      "models/storage_model.ts": "typescript",
      "component.tsx": "tsx",
      "data.json": "json",
      "README.md": "markdown",
      "scripts/main.py": "python",
      "db/schema.sql": "sql",
      "scripts/run.sh": "shellscript",
      "config.yaml": "yaml",
      "config.yml": "yaml",
      "icon.svg": "xml",
      "main.go": "go",
      "lib.rs": "rust",
      "App.java": "java",
      "Main.kt": "kotlin",
      "index.php": "php",
      "query.graphql": "graphql",
      "App.vue": "vue",
      "App.svelte": "svelte",
      "page.astro": "astro",
      Dockerfile: "docker",
      Makefile: "make",
      ".env": "dotenv",
    };
    for (const [file, language] of Object.entries(expectations)) {
      expect(codeWorkspaceLanguage(file), file).toBe(language);
    }
  });

  it("leaves unknown or binary files without a grammar", () => {
    expect(codeWorkspaceLanguage(null)).toBeNull();
    expect(codeWorkspaceLanguage("notes.txt")).toBeNull();
    expect(codeWorkspaceLanguage("logo.png")).toBeNull();
    expect(codeWorkspaceLanguage("archive")).toBeNull();
  });
});
