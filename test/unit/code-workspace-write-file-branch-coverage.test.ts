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
vi.mock("@/lib/logger", () => ({ logHandledError: vi.fn() }));

import {
  deleteCodeWorkspaceFile,
  getCodeWorkspaceFileBytes,
  importCodeWorkspaceFile,
  writeCodeWorkspaceFile,
} from "@/modules/code-workspace/storage";

const workspaceId = "ws-1";
const userId = "user-1";
const now = new Date().toISOString();

function seedWorkspace(
  projectId: string,
  files: Array<{ path: string; size: number; binary?: boolean }>,
  rootFile: string | null,
) {
  const metadata = {
    id: projectId,
    workspaceId,
    createdByUserId: userId,
    title: "Test workspace",
    rootFile,
    version: 1,
    previewToken: "token",
    createdAt: now,
    updatedAt: now,
    files: files.map((file) => ({
      path: file.path,
      size: file.size,
      mimeType: file.binary ? "image/png" : "text/html",
      binary: file.binary ?? false,
      hash: "hash",
      updatedAt: now,
    })),
  };
  storageMock.objects.set(`code-workspaces/${projectId}/metadata.json`, {
    bytes: new TextEncoder().encode(JSON.stringify(metadata)),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  storageMock.objects.clear();
});

describe("code workspace file write branch coverage", () => {
  it("updates an existing file in place", async () => {
    seedWorkspace("aaaaaaaa-bbbb-4ccc-8ddd-eeeeee000001", [{ path: "index.html", size: 10 }], "index.html");
    const artifact = await writeCodeWorkspaceFile({
      projectId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeee000001",
      workspaceId,
      userId,
      filePath: "index.html",
      content: "<html>updated</html>",
    });
    expect(artifact.version).toBe(2);
    const metadata = JSON.parse(
      Buffer.from(
        await storageMock.download("code-workspaces/aaaaaaaa-bbbb-4ccc-8ddd-eeeeee000001/metadata.json"),
      ).toString("utf8"),
    );
    expect(metadata.files).toHaveLength(1);
    expect(metadata.files[0].path).toBe("index.html");
  });

  it("rejects workspaces that already hold the maximum number of files", async () => {
    seedWorkspace(
      "aaaaaaaa-bbbb-4ccc-8ddd-eeeeee000002",
      Array.from({ length: 500 }, (_, i) => ({
        path: `f${i}.html`,
        size: 10,
      })),
      "f0.html",
    );
    await expect(
      writeCodeWorkspaceFile({
        projectId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeee000002",
        workspaceId,
        userId,
        filePath: "new.html",
        content: "x",
      }),
    ).rejects.toThrow("Too many files");
  });

  it("rejects imports that push the workspace over the byte budget", async () => {
    seedWorkspace(
      "aaaaaaaa-bbbb-4ccc-8ddd-eeeeee000003",
      [{ path: "big.png", size: 49 * 1024 * 1024, binary: true }],
      null,
    );
    await expect(
      importCodeWorkspaceFile({
        projectId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeee000003",
        workspaceId,
        userId,
        filePath: "extra.png",
        bytes: new Uint8Array(1024 * 1024 + 1),
      }),
    ).rejects.toThrow("too large");
  });

  it("recomputes the root file when the recorded root is gone", async () => {
    seedWorkspace(
      "aaaaaaaa-bbbb-4ccc-8ddd-eeeeee000004",
      [{ path: "index.html", size: 10 }],
      "old.html",
    );
    const artifact = await writeCodeWorkspaceFile({
      projectId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeee000004",
      workspaceId,
      userId,
      filePath: "about.html",
      content: "about",
    });
    expect(artifact.rootFile).toBe("index.html");
  });

  it("rejects imports of unsupported file types", async () => {
    seedWorkspace("aaaaaaaa-bbbb-4ccc-8ddd-eeeeee000005", [{ path: "index.html", size: 10 }], "index.html");
    await expect(
      importCodeWorkspaceFile({
        projectId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeee000005",
        workspaceId,
        userId,
        filePath: "evil.exe",
        bytes: new Uint8Array([1]),
      }),
    ).rejects.toThrow("Only supported web files");
  });

  it("rejects oversized text imports", async () => {
    seedWorkspace("aaaaaaaa-bbbb-4ccc-8ddd-eeeeee000006", [{ path: "index.html", size: 10 }], "index.html");
    await expect(
      importCodeWorkspaceFile({
        projectId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeee000006",
        workspaceId,
        userId,
        filePath: "index.html",
        bytes: new Uint8Array(1_000_001),
      }),
    ).rejects.toThrow("File content is too large");
  });

  it("rethrows access failures from imports", async () => {
    seedWorkspace("aaaaaaaa-bbbb-4ccc-8ddd-eeeeee000007", [{ path: "index.html", size: 10 }], "index.html");
    await expect(
      importCodeWorkspaceFile({
        projectId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeee000007",
        workspaceId: "ws-other",
        userId,
        filePath: "index.html",
        bytes: new Uint8Array([1]),
      }),
    ).rejects.toThrow("Code workspace not found");
  });

  it("picks a new root file when the root is deleted", async () => {
    seedWorkspace(
      "aaaaaaaa-bbbb-4ccc-8ddd-eeeeee000008",
      [
        { path: "index.html", size: 10 },
        { path: "about.html", size: 10 },
      ],
      "index.html",
    );
    const artifact = await deleteCodeWorkspaceFile({
      projectId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeee000008",
      workspaceId,
      userId,
      filePath: "index.html",
    });
    expect(artifact.rootFile).toBe("about.html");
  });

  it("falls back to the root file and then index.html when reading bytes", async () => {
    seedWorkspace("aaaaaaaa-bbbb-4ccc-8ddd-eeeeee000009", [{ path: "index.html", size: 10 }], "index.html");
    storageMock.objects.set("code-workspaces/aaaaaaaa-bbbb-4ccc-8ddd-eeeeee000009/files/index.html", {
      bytes: new TextEncoder().encode("<html></html>"),
    });
    const byRoot = await getCodeWorkspaceFileBytes({
      projectId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeee000009",
      filePath: "",
    });
    expect(byRoot.summary.path).toBe("index.html");

    seedWorkspace("aaaaaaaa-bbbb-4ccc-8ddd-eeeeee000010", [{ path: "index.html", size: 10 }], null);
    storageMock.objects.set("code-workspaces/aaaaaaaa-bbbb-4ccc-8ddd-eeeeee000010/files/index.html", {
      bytes: new TextEncoder().encode("<html></html>"),
    });
    const byDefault = await getCodeWorkspaceFileBytes({
      projectId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeee000010",
      filePath: "",
    });
    expect(byDefault.summary.path).toBe("index.html");
  });

  it("throws when the requested file is missing", async () => {
    seedWorkspace("aaaaaaaa-bbbb-4ccc-8ddd-eeeeee000011", [{ path: "index.html", size: 10 }], "index.html");
    await expect(
      getCodeWorkspaceFileBytes({ projectId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeee000011", filePath: "missing.html" }),
    ).rejects.toThrow("File not found");
  });
});