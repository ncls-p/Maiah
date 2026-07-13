import { describe, expect, it } from "vitest";

import {
  codeWorkspaceGridTemplate,
  DEFAULT_CHAT_WIDTH,
  DEFAULT_CODE_WORKSPACE_LAYOUT,
  MAX_CHAT_WIDTH,
  MIN_CHAT_WIDTH,
  normalizeCodeWorkspaceChatWidth,
  normalizeCodeWorkspaceLayout,
  resizeCodeWorkspacePane,
  toggleCodeWorkspacePane,
  visibleCodeWorkspacePanes,
} from "@/components/chat/code-workspace-layout";

describe("code workspace layout", () => {
  it("normalizes persisted values and clamps unsafe widths", () => {
    expect(
      normalizeCodeWorkspaceLayout({
        visible: { files: false, code: true, preview: false },
        filesWidth: 20,
        codeWidth: 5_000,
      }),
    ).toEqual({
      visible: { files: false, code: true, preview: false },
      filesWidth: 160,
      codeWidth: 900,
    });
  });

  it("keeps every pane independently hideable and restorable", () => {
    const filesHidden = toggleCodeWorkspacePane(
      DEFAULT_CODE_WORKSPACE_LAYOUT,
      "files",
    );
    const codeHidden = toggleCodeWorkspacePane(filesHidden, "code");
    const previewHidden = toggleCodeWorkspacePane(codeHidden, "preview");

    expect(visibleCodeWorkspacePanes(previewHidden)).toEqual([]);
    expect(
      visibleCodeWorkspacePanes(
        toggleCodeWorkspacePane(previewHidden, "preview"),
      ),
    ).toEqual(["preview"]);
  });

  it("builds responsive desktop columns only for visible panes", () => {
    expect(codeWorkspaceGridTemplate(DEFAULT_CODE_WORKSPACE_LAYOUT)).toBe(
      "208px 0.75rem minmax(240px, 320px) 0.75rem minmax(0, 1fr)",
    );
    expect(
      codeWorkspaceGridTemplate({
        ...DEFAULT_CODE_WORKSPACE_LAYOUT,
        visible: { files: false, code: true, preview: true },
      }),
    ).toBe("minmax(240px, 320px) 0.75rem minmax(0, 1fr)");
  });

  it("clamps pointer and keyboard resize values", () => {
    expect(
      resizeCodeWorkspacePane(DEFAULT_CODE_WORKSPACE_LAYOUT, "files", 999)
        .filesWidth,
    ).toBe(360);
    expect(
      resizeCodeWorkspacePane(DEFAULT_CODE_WORKSPACE_LAYOUT, "code", 10)
        .codeWidth,
    ).toBe(240);
    expect(normalizeCodeWorkspaceChatWidth(10)).toBe(MIN_CHAT_WIDTH);
    expect(normalizeCodeWorkspaceChatWidth(5_000)).toBe(MAX_CHAT_WIDTH);
    expect(normalizeCodeWorkspaceChatWidth("invalid")).toBe(DEFAULT_CHAT_WIDTH);
  });
});
