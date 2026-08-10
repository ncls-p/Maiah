import JSZip from "jszip";
import { beforeEach, describe, expect, it, vi } from "vitest";

const storageMock = vi.hoisted(() => {
  const objects = new Map<
    string,
    { bytes: Uint8Array; contentType?: string }
  >();
  return {
    objects,
    upload: vi.fn(
      async (
        key: string,
        bytes: Uint8Array | Buffer | string,
        contentType?: string,
      ) => {
        objects.set(key, {
          bytes:
            typeof bytes === "string"
              ? new TextEncoder().encode(bytes)
              : new Uint8Array(bytes),
          contentType,
        });
      },
    ),
    download: vi.fn(async (key: string) => {
      const object = objects.get(key);
      if (!object) throw new Error(`missing ${key}`);
      return object.bytes;
    }),
    delete: vi.fn(async (key: string) => {
      objects.delete(key);
    }),
  };
});

vi.mock("@/server/infrastructure/storage", () => ({
  storage: storageMock,
}));

vi.mock("@/lib/logger", () => ({
  logHandledError: vi.fn(),
}));

import {
  codeWorkspaceArtifact,
  createCodeWorkspaceFromFiles,
  createCodeWorkspaceZip,
  deleteCodeWorkspaceFile,
  getCodeWorkspaceFileBytes,
  getCodeWorkspaceFilesForPublish,
  importCodeWorkspaceFile,
  listCodeWorkspaceFiles,
  readCodeWorkspaceFile,
  writeCodeWorkspaceFile,
} from "@/modules/code-workspace/storage";

const workspaceId = "ws-1";
const userId = "user-1";

function metadataKey(projectId: string) {
  return `code-workspaces/${projectId}/metadata.json`;
}

async function loadMetadata(projectId: string) {
  return JSON.parse(
    Buffer.from(await storageMock.download(metadataKey(projectId))).toString(
      "utf8",
    ),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  storageMock.objects.clear();
});

describe("code workspace storage", () => {
  it("lists, reads, writes, deletes, publishes, and zips workspace files", async () => {
    const created = await createCodeWorkspaceFromFiles({
      workspaceId,
      userId,
      title: "Demo App",
      files: [
        { path: "index.html", content: "<h1>Old</h1>" },
        { path: "style.css", content: "body{}" },
      ],
    });
    const projectId = created.projectId;

    await expect(
      listCodeWorkspaceFiles({ projectId, workspaceId, userId }),
    ).resolves.toMatchObject({ projectId });
    await expect(
      readCodeWorkspaceFile({
        projectId,
        workspaceId,
        userId,
        filePath: "index.html",
      }),
    ).resolves.toMatchObject({
      content: "<h1>Old</h1>",
      mimeType: "text/html; charset=utf-8",
    });

    const updated = await writeCodeWorkspaceFile({
      projectId,
      workspaceId,
      userId,
      filePath: "about.html",
      content: "<h1>About</h1>",
    });
    expect(updated.version).toBe(2);
    expect(updated.files.map((file) => file.path)).toContain("about.html");

    const imported = await importCodeWorkspaceFile({
      projectId,
      workspaceId,
      userId,
      filePath: "assets/logo.png",
      bytes: new Uint8Array([137, 80, 78, 71]),
    });
    expect(imported.version).toBe(3);
    expect(imported.files).toContainEqual(
      expect.objectContaining({
        path: "assets/logo.png",
        binary: true,
        mimeType: "image/png",
      }),
    );

    const deleted = await deleteCodeWorkspaceFile({
      projectId,
      workspaceId,
      userId,
      filePath: "index.html",
    });
    expect(deleted.version).toBe(4);
    expect(deleted.rootFile).toBe("about.html");

    const bytes = await getCodeWorkspaceFileBytes({
      projectId,
      filePath: "about.html",
    });
    expect(Buffer.from(bytes.bytes).toString("utf8")).toBe("<h1>About</h1>");

    const publish = await getCodeWorkspaceFilesForPublish({
      projectId,
      workspaceId,
      userId,
    });
    expect(publish.files.map((file) => file.path)).toEqual([
      "about.html",
      "assets/logo.png",
      "style.css",
    ]);
    expect(Buffer.from(publish.files[0].bytes).toString("utf8")).toBe(
      "<h1>About</h1>",
    );

    const zipped = await createCodeWorkspaceZip({
      projectId,
      workspaceId,
      userId,
    });
    expect(zipped.fileName).toBe("Demo-App.zip");
    const reopened = await JSZip.loadAsync(zipped.bytes);
    expect(Object.keys(reopened.files).sort()).toEqual([
      "about.html",
      "assets/",
      "assets/logo.png",
      "style.css",
    ]);

    const metadata = await loadMetadata(projectId);
    expect(codeWorkspaceArtifact(metadata, "ok").message).toBe("ok");
  });

  it("enforces access, read/write constraints, and missing-file handling", async () => {
    const created = await createCodeWorkspaceFromFiles({
      workspaceId,
      userId,
      title: "Demo",
      files: [{ path: "index.html", content: "<h1>Hi</h1>" }],
    });
    await expect(
      listCodeWorkspaceFiles({
        projectId: created.projectId,
        workspaceId: "other",
        userId,
      }),
    ).rejects.toThrow("Code workspace not found");
    await expect(
      readCodeWorkspaceFile({
        projectId: created.projectId,
        workspaceId,
        userId,
        filePath: "missing.html",
      }),
    ).rejects.toThrow("File not found");
    await expect(
      writeCodeWorkspaceFile({
        projectId: created.projectId,
        workspaceId,
        userId,
        filePath: "image.png",
        content: "bad",
      }),
    ).rejects.toThrow("Only supported text web files");
    await expect(
      deleteCodeWorkspaceFile({
        projectId: created.projectId,
        workspaceId,
        userId,
        filePath: "missing.html",
      }),
    ).rejects.toThrow("File not found");
  });
});
