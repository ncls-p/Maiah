import { randomUUID } from "node:crypto";

import type { ChatAttachment } from "@/modules/chat/attachments";
import type { WorkspaceBashInput } from "@/modules/code-workspace/runtime.schemas";
import {
  clampTimeoutMs,
  type CodeSandboxResult,
  type PreparedSandboxRunnerInput,
} from "@/modules/tool/code-sandbox.code-sandbox-output-file";
import {
  closeSandboxSession,
  openSandboxSession,
  runSandboxSession,
} from "@/modules/tool/code-sandbox.persist-sandbox-files";
import { prepareSandboxRunnerRequest } from "@/modules/tool/code-sandbox.prepare-sandbox-runner-request";

export type RuntimeFile = { path: string; bytes: Buffer };

type ExecutionOptions = {
  workspaceId: string;
  userId: string;
  attachments?: ChatAttachment[];
  snapshot: () => Promise<RuntimeFile[]>;
  checkpoint: (result: CodeSandboxResult) => Promise<unknown>;
};

export class CodeWorkspaceExecution {
  private readonly runtimeId = randomUUID();
  private readonly pendingFiles = new Map<string, Buffer>();
  private mountedFiles?: Promise<RuntimeFile[]>;
  private sessionId?: string;

  constructor(private readonly options: ExecutionOptions) {}

  syncFile(path: string, bytes: Buffer) {
    if (this.sessionId) this.pendingFiles.set(path, bytes);
  }

  private loadMountedFiles() {
    this.mountedFiles ??= prepareSandboxRunnerRequest(
      {
        language: "bash",
        code: ":",
        attachments: (this.options.attachments ?? []).map((attachment) => ({
          id: attachment.id,
        })),
      },
      {
        workspaceId: this.options.workspaceId,
        userId: this.options.userId,
      },
    ).then((input) => input.files);
    return this.mountedFiles;
  }

  async readMounted(path: string) {
    return (await this.loadMountedFiles()).find((file) => file.path === path);
  }

  private async openingFiles() {
    const [workspaceFiles, mountedFiles] = await Promise.all([
      this.options.snapshot(),
      this.loadMountedFiles(),
    ]);
    return [...mountedFiles, ...workspaceFiles];
  }

  private async ensureSession(timeoutMs?: number) {
    if (this.sessionId) return this.sessionId;
    this.sessionId = await openSandboxSession(
      {
        language: "bash",
        code: ":",
        timeoutMs: clampTimeoutMs(timeoutMs),
        files: await this.openingFiles(),
        attachments: [],
      },
      this.runtimeId,
    );
    return this.sessionId;
  }

  async execute(input: {
    language: "bash" | "node" | "python";
    code: string;
    timeoutMs?: number;
    includeFileContent?: boolean;
    stdin?: string;
    stdinFile?: Buffer;
  }) {
    const runnerInput: PreparedSandboxRunnerInput = {
      language: input.language,
      code: input.code,
      timeoutMs: clampTimeoutMs(input.timeoutMs),
      stdin: input.stdin,
      stdinFile: input.stdinFile,
      files: [...this.pendingFiles].map(([path, bytes]) => ({ path, bytes })),
      attachments: [],
    };
    const result = await runSandboxSession(
      await this.ensureSession(input.timeoutMs),
      runnerInput,
      this.runtimeId,
    );
    this.pendingFiles.clear();
    const artifact = await this.options.checkpoint(result);
    const publicFiles = input.includeFileContent
      ? result.files
      : result.files.map((file) => {
          const publicFile = { ...file };
          delete publicFile.contentBase64;
          return publicFile;
        });
    return artifact
      ? {
          ...artifact,
          execution: {
            ok: result.ok,
            exitCode: result.exitCode,
            signal: result.signal,
            timedOut: result.timedOut,
            durationMs: result.durationMs,
            stdout: result.stdout,
            stderr: result.stderr,
            truncated: result.truncated,
            files: publicFiles,
          },
        }
      : { ...result, files: publicFiles };
  }

  bash(input: WorkspaceBashInput) {
    return this.execute({
      language: "bash",
      code: input.command,
      timeoutMs: input.timeoutMs,
    });
  }

  async dispose() {
    const sessionId = this.sessionId;
    this.sessionId = undefined;
    if (sessionId) await closeSandboxSession(sessionId);
  }
}
