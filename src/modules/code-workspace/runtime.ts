import { type ChatAttachment } from "@/modules/chat/attachments";
import {
  createEmptyCodeWorkspace,
  deleteCodeWorkspaceFile,
  getCodeWorkspaceFilesForPublish,
  importCodeWorkspaceFile,
  listCodeWorkspaceFiles,
  readCodeWorkspaceFile,
  writeCodeWorkspaceFile,
} from "@/modules/code-workspace/storage";
import {
  isAllowedPath,
  isTextWorkspacePath,
  normalizeWorkspacePath,
} from "@/modules/code-workspace/storage.assert-safe-project-id";
import type { CodeSandboxResult } from "@/modules/tool/code-sandbox.code-sandbox-output-file";
import { applyExactTextEdits } from "./runtime.edit";
import { CodeWorkspaceExecution, type RuntimeFile } from "./runtime.execution";
import type {
  WorkspaceEditInput,
  WorkspaceReadInput,
  WorkspaceWriteInput,
} from "./runtime.schemas";

const maxReadBytes = 50_000;
const maxReadLines = 2_000;

export type CodeWorkspaceRuntimeOptions = {
  workspaceId: string;
  userId: string;
  projectId?: string;
  durable?: boolean;
  title?: string;
  files?: RuntimeFile[];
  attachments?: ChatAttachment[];
};

export class CodeWorkspaceRuntime {
  private projectId?: string;
  private readonly ephemeralFiles = new Map<string, Buffer>();
  private operationQueue: Promise<unknown> = Promise.resolve();
  private readonly execution: CodeWorkspaceExecution;

  constructor(private readonly options: CodeWorkspaceRuntimeOptions) {
    this.projectId = options.projectId;
    for (const file of options.files ?? []) {
      this.ephemeralFiles.set(normalizeWorkspacePath(file.path), file.bytes);
    }
    this.execution = new CodeWorkspaceExecution({
      workspaceId: options.workspaceId,
      userId: options.userId,
      attachments: options.attachments,
      snapshot: () => this.snapshot(),
      checkpoint: (result) => this.checkpoint(result),
    });
  }

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operationQueue.then(operation, operation);
    this.operationQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private async ensureDurableProject() {
    if (!this.options.durable || this.projectId) return this.projectId;
    const artifact = await createEmptyCodeWorkspace({
      workspaceId: this.options.workspaceId,
      userId: this.options.userId,
      title: this.options.title,
    });
    this.projectId = artifact.projectId;
    return this.projectId;
  }

  private async readBytes(filePath: string) {
    const path = normalizeWorkspacePath(filePath);
    if (this.projectId) {
      try {
        const result = await readCodeWorkspaceFile({
          projectId: this.projectId,
          workspaceId: this.options.workspaceId,
          userId: this.options.userId,
          filePath: path,
        });
        return { path, bytes: Buffer.from(result.content, "utf8") };
      } catch (error) {
        const mounted = path.startsWith("attachments/")
          ? await this.execution.readMounted(path)
          : undefined;
        if (mounted) return mounted;
        throw error;
      }
    }
    const bytes = this.ephemeralFiles.get(path);
    if (bytes) return { path, bytes };
    const mounted = await this.execution.readMounted(path);
    if (!mounted) throw new Error("File not found in code workspace.");
    return mounted;
  }

  async read(input: WorkspaceReadInput) {
    return this.serialize(async () => {
      const { path, bytes } = await this.readBytes(input.path);
      if (!isTextWorkspacePath(path)) {
        throw new Error("Binary files cannot be read as text.");
      }
      const lines = bytes.toString("utf8").split("\n");
      const start = Math.max(0, (input.offset ?? 1) - 1);
      if (start >= lines.length) {
        throw new Error(
          `Offset ${input.offset} is beyond end of file (${lines.length} lines).`,
        );
      }
      const requestedEnd = input.limit
        ? Math.min(lines.length, start + input.limit)
        : Math.min(lines.length, start + maxReadLines);
      let end = requestedEnd;
      let content = lines.slice(start, end).join("\n");
      while (Buffer.byteLength(content) > maxReadBytes && end > start + 1) {
        end -= 1;
        content = lines.slice(start, end).join("\n");
      }
      const truncated = end < lines.length;
      return {
        path,
        content: content.slice(0, maxReadBytes),
        lines: { start: start + 1, end, total: lines.length },
        truncated,
        ...(truncated ? { nextOffset: end + 1 } : {}),
      };
    });
  }

  async write(input: WorkspaceWriteInput) {
    return this.serialize(async () => {
      const path = normalizeWorkspacePath(input.path);
      if (!isAllowedPath(path) || !isTextWorkspacePath(path)) {
        throw new Error("Unsupported text file type.");
      }
      const projectId = await this.ensureDurableProject();
      if (projectId) {
        const artifact = await writeCodeWorkspaceFile({
          projectId,
          workspaceId: this.options.workspaceId,
          userId: this.options.userId,
          filePath: path,
          content: input.content,
        });
        this.execution.syncFile(path, Buffer.from(input.content, "utf8"));
        return artifact;
      }
      const bytes = Buffer.from(input.content, "utf8");
      this.ephemeralFiles.set(path, bytes);
      this.execution.syncFile(path, bytes);
      return { ok: true, path, bytes: Buffer.byteLength(input.content) };
    });
  }

  async edit(input: WorkspaceEditInput) {
    return this.serialize(async () => {
      const { path, bytes } = await this.readBytes(input.path);
      const content = applyExactTextEdits(bytes.toString("utf8"), input.edits);
      const projectId = await this.ensureDurableProject();
      if (projectId) {
        const artifact = await writeCodeWorkspaceFile({
          projectId,
          workspaceId: this.options.workspaceId,
          userId: this.options.userId,
          filePath: path,
          content,
        });
        this.execution.syncFile(path, Buffer.from(content, "utf8"));
        return artifact;
      }
      const nextBytes = Buffer.from(content, "utf8");
      this.ephemeralFiles.set(path, nextBytes);
      this.execution.syncFile(path, nextBytes);
      return { ok: true, path, edits: input.edits.length };
    });
  }

  private async snapshot(): Promise<RuntimeFile[]> {
    if (this.projectId) {
      const workspace = await getCodeWorkspaceFilesForPublish({
        projectId: this.projectId,
        workspaceId: this.options.workspaceId,
        userId: this.options.userId,
      });
      return workspace.files.map((file) => ({
        path: file.path,
        bytes: Buffer.from(file.bytes),
      }));
    }
    return [...this.ephemeralFiles].map(([path, bytes]) => ({ path, bytes }));
  }

  private async checkpoint(result: CodeSandboxResult) {
    const changed = result.files.filter(
      (file) => file.modified === true || file.fromInput !== true,
    );
    const projectId =
      changed.length > 0 ? await this.ensureDurableProject() : this.projectId;
    for (const file of changed) {
      const path = normalizeWorkspacePath(file.path);
      if (file.deleted) {
        if (projectId) {
          await deleteCodeWorkspaceFile({
            projectId,
            workspaceId: this.options.workspaceId,
            userId: this.options.userId,
            filePath: path,
          });
        } else {
          this.ephemeralFiles.delete(path);
        }
        continue;
      }
      if (!file.contentBase64) {
        throw new Error(`Sandbox did not return changed file content: ${path}`);
      }
      const bytes = Buffer.from(file.contentBase64, "base64");
      if (projectId) {
        await importCodeWorkspaceFile({
          projectId,
          workspaceId: this.options.workspaceId,
          userId: this.options.userId,
          filePath: path,
          bytes,
        });
      } else {
        this.ephemeralFiles.set(path, bytes);
      }
    }
    return projectId
      ? listCodeWorkspaceFiles({
          projectId,
          workspaceId: this.options.workspaceId,
          userId: this.options.userId,
        })
      : null;
  }

  async execute(input: {
    language: "bash" | "node" | "python";
    code: string;
    timeoutMs?: number;
    includeFileContent?: boolean;
    stdin?: string;
    stdinFile?: Buffer;
  }) {
    return this.serialize(() => this.execution.execute(input));
  }

  bash(input: import("./runtime.schemas").WorkspaceBashInput) {
    return this.serialize(() => this.execution.bash(input));
  }

  dispose() {
    return this.execution.dispose();
  }
}

export function createCodeWorkspaceRuntime(
  options: CodeWorkspaceRuntimeOptions,
) {
  return new CodeWorkspaceRuntime(options);
}
