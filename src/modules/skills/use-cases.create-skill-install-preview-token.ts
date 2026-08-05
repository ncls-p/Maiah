import { execFile } from "node:child_process";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { mkdtemp, mkdir, readdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { logHandledError } from "@/lib/logger";
import { env } from "@/lib/env";
import { audit } from "@/server/domain/services/audit";
import { authorization } from "@/server/domain/services/authorization";
import { db } from "@/server/infrastructure/db";
import {
  agentSkillBindings,
  agentSkills,
} from "@/server/infrastructure/db/schema";
import {
  SkillFrontmatter,
  SkillPreviewAttestation,
  SkillPreviewConflictError,
  SkillPreviewResult,
  execFileAsync,
  skillPreviewTokenVersion,
  skillPreviewTtlMs,
  stripAnsi,
} from "./use-cases.exec-file-async";
import {
  checksumSkillPreview,
  installCommandHash,
  signSkillPreviewPayload,
} from "./use-cases.parse-skills-install-command";

export function createSkillInstallPreviewToken(input: {
  workspaceId: string;
  userId: string;
  installCommand: string;
  skills: SkillPreviewResult[];
  now?: number;
}) {
  const expiresAt = (input.now ?? Date.now()) + skillPreviewTtlMs;
  const attestation: SkillPreviewAttestation = {
    version: skillPreviewTokenVersion,
    workspaceId: input.workspaceId,
    userId: input.userId,
    commandHash: installCommandHash(input.installCommand),
    contentChecksum: checksumSkillPreview(input.skills),
    expiresAt,
  };
  const payload = Buffer.from(JSON.stringify(attestation)).toString(
    "base64url",
  );
  return {
    previewToken: `${payload}.${signSkillPreviewPayload(payload)}`,
    expiresAt: new Date(expiresAt).toISOString(),
    contentChecksum: attestation.contentChecksum,
  };
}

function invalidSkillPreview(): never {
  throw new SkillPreviewConflictError(
    "Skill preview is invalid or expired. Preview the source again before installing.",
  );
}

export function verifySkillInstallPreviewToken(input: {
  previewToken: string;
  workspaceId: string;
  userId: string;
  installCommand: string;
  now?: number;
}) {
  const [payload, signature, extra] = input.previewToken.split(".");
  if (!payload || !signature || extra) invalidSkillPreview();

  const expectedSignature = signSkillPreviewPayload(payload);
  const actualBytes = Buffer.from(signature, "utf8");
  const expectedBytes = Buffer.from(expectedSignature, "utf8");
  if (
    actualBytes.length !== expectedBytes.length ||
    !timingSafeEqual(actualBytes, expectedBytes)
  ) {
    invalidSkillPreview();
  }

  let attestation: SkillPreviewAttestation;
  try {
    attestation = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as SkillPreviewAttestation;
  } catch {
    invalidSkillPreview();
  }

  if (
    attestation.version !== skillPreviewTokenVersion ||
    attestation.workspaceId !== input.workspaceId ||
    attestation.userId !== input.userId ||
    attestation.commandHash !== installCommandHash(input.installCommand) ||
    !Number.isFinite(attestation.expiresAt) ||
    attestation.expiresAt <= (input.now ?? Date.now()) ||
    !/^([a-f0-9]{64})$/.test(attestation.contentChecksum)
  ) {
    invalidSkillPreview();
  }

  return attestation;
}

function processOutputToString(value: unknown) {
  if (!value) return "";
  return Buffer.isBuffer(value) ? value.toString("utf8") : String(value);
}

export async function runSkillsCli(
  args: string[],
  tempDir: string,
  tempHome: string,
) {
  try {
    return await execFileAsync("npx", args, {
      cwd: tempDir,
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: "0",
        HOME: tempHome,
        NO_UPDATE_NOTIFIER: "1",
        npm_config_update_notifier: "false",
        npm_config_yes: "true",
      },
      timeout: 120_000,
      maxBuffer: 2_000_000,
    });
  } catch (error) {
    const execError = error as Error & {
      code?: unknown;
      stderr?: unknown;
      stdout?: unknown;
    };
    const output = stripAnsi(
      [
        processOutputToString(execError.stdout),
        processOutputToString(execError.stderr),
      ]
        .filter(Boolean)
        .join("\n"),
    ).trim();
    const exit = execError.code ? ` (exit ${String(execError.code)})` : "";
    const reason = (output || execError.message).slice(0, 4_000);
    throw new Error(`Skill CLI failed${exit}: ${reason}`, { cause: error });
  }
}

export async function walkFiles(root: string): Promise<string[]> {
  try {
    const entries = await readdir(root, { withFileTypes: true });
    const files: string[] = [];
    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      const fullPath = path.join(root, entry.name);
      if (entry.isDirectory()) {
        files.push(...(await walkFiles(fullPath)));
        continue;
      }
      if (entry.isFile()) files.push(fullPath);
    }
    return files;
  } catch (error) {
    logHandledError("Failed to walk skill files", { root }, error as Error);
    throw error;
  }
}

export function parseFrontmatter(markdown: string): SkillFrontmatter {
  const match = markdown.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const frontmatter: SkillFrontmatter = {};
  for (const line of match[1].split("\n")) {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex === -1) continue;
    const key = line.slice(0, separatorIndex).trim();
    const value = line
      .slice(separatorIndex + 1)
      .trim()
      .replace(/^['"]|['"]$/g, "");
    if (key === "name") frontmatter.name = value;
    if (key === "description") frontmatter.description = value;
  }
  return frontmatter;
}
