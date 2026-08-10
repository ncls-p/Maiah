export const CODE_WORKSPACE_PANES = ["files", "code", "preview"] as const;

export type CodeWorkspacePane = (typeof CODE_WORKSPACE_PANES)[number];

export type CodeWorkspaceLayout = {
  visible: Record<CodeWorkspacePane, boolean>;
  filesWidth: number;
  codeWidth: number;
};

export const MIN_FILES_WIDTH = 160;
export const MAX_FILES_WIDTH = 360;
export const MIN_CODE_WIDTH = 240;
export const MAX_CODE_WIDTH = 900;
export const MIN_CHAT_WIDTH = 300;
export const MAX_CHAT_WIDTH = 720;
export const DEFAULT_CHAT_WIDTH = 360;
export const CODE_WORKSPACE_RESIZE_STEP = 24;
export const CODE_WORKSPACE_CHAT_WIDTH_STORAGE_KEY =
  "maiah-code-workspace-chat-width-v1";

export const DEFAULT_CODE_WORKSPACE_LAYOUT: CodeWorkspaceLayout = {
  visible: { files: true, code: true, preview: true },
  filesWidth: 208,
  codeWidth: 320,
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, Math.round(value)));
}

function finiteNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function normalizeCodeWorkspaceLayout(
  value: unknown,
): CodeWorkspaceLayout {
  if (typeof value !== "object" || value === null) {
    return DEFAULT_CODE_WORKSPACE_LAYOUT;
  }
  const record = value as Record<string, unknown>;
  const visibleRecord =
    typeof record.visible === "object" && record.visible !== null
      ? (record.visible as Record<string, unknown>)
      : {};
  return {
    visible: {
      files:
        typeof visibleRecord.files === "boolean" ? visibleRecord.files : true,
      code: typeof visibleRecord.code === "boolean" ? visibleRecord.code : true,
      preview:
        typeof visibleRecord.preview === "boolean"
          ? visibleRecord.preview
          : true,
    },
    filesWidth: clamp(
      finiteNumber(record.filesWidth, DEFAULT_CODE_WORKSPACE_LAYOUT.filesWidth),
      MIN_FILES_WIDTH,
      MAX_FILES_WIDTH,
    ),
    codeWidth: clamp(
      finiteNumber(record.codeWidth, DEFAULT_CODE_WORKSPACE_LAYOUT.codeWidth),
      MIN_CODE_WIDTH,
      MAX_CODE_WIDTH,
    ),
  };
}

export function visibleCodeWorkspacePanes(layout: CodeWorkspaceLayout) {
  return CODE_WORKSPACE_PANES.filter((pane) => layout.visible[pane]);
}

export function codeWorkspaceGridTemplate(layout: CodeWorkspaceLayout) {
  const visiblePanes = visibleCodeWorkspacePanes(layout);
  if (visiblePanes.length === 0) return "minmax(0, 1fr)";

  return visiblePanes
    .flatMap((pane, index) => {
      const isLast = index === visiblePanes.length - 1;
      const column = isLast
        ? "minmax(0, 1fr)"
        : pane === "files"
          ? `${layout.filesWidth}px`
          : pane === "code"
            ? `minmax(${MIN_CODE_WIDTH}px, ${layout.codeWidth}px)`
            : "minmax(0, 1fr)";
      return index === 0 ? [column] : ["0.75rem", column];
    })
    .join(" ");
}

export function resizeCodeWorkspacePane(
  layout: CodeWorkspaceLayout,
  pane: "files" | "code",
  nextWidth: number,
): CodeWorkspaceLayout {
  return pane === "files"
    ? {
        ...layout,
        filesWidth: clamp(nextWidth, MIN_FILES_WIDTH, MAX_FILES_WIDTH),
      }
    : {
        ...layout,
        codeWidth: clamp(nextWidth, MIN_CODE_WIDTH, MAX_CODE_WIDTH),
      };
}

export function normalizeCodeWorkspaceChatWidth(value: unknown) {
  return clamp(
    finiteNumber(value, DEFAULT_CHAT_WIDTH),
    MIN_CHAT_WIDTH,
    MAX_CHAT_WIDTH,
  );
}

export function toggleCodeWorkspacePane(
  layout: CodeWorkspaceLayout,
  pane: CodeWorkspacePane,
): CodeWorkspaceLayout {
  return {
    ...layout,
    visible: { ...layout.visible, [pane]: !layout.visible[pane] },
  };
}
