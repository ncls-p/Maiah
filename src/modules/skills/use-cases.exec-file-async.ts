import { authorization } from "@/server/domain/services/authorization";
import { agentSkills } from "@/server/infrastructure/db/schema";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

export const execFileAsync = promisify(execFile);
export const maxInstallCommandLength = 700;
export const maxMarkdownFileBytes = 128_000;
export const maxSkillMarkdownBytes = 320_000;
export const maxPromptBytes = 48_000;
export const skillDescriptionMaxLength = 1024;
export const skillNamePattern = /^[a-z0-9-]{1,64}$/;
export const skillPreviewTokenVersion = 1;
export const skillPreviewTtlMs = 10 * 60_000;

export type SkillMarkdownFile = {
  path: string;
  content: string;
};

export type ParsedInstallCommand = {
  sourcePackage: string;
  skillNames: string[];
};

export type SkillFrontmatter = {
  name?: string;
  description?: string;
};

export type AgentSkillRow = typeof agentSkills.$inferSelect;

export type SkillPreviewResult = {
  name: string;
  description: string | null;
  markdownFiles: SkillMarkdownFile[];
  sourcePackage: string;
};

export type LoadedSkillPackage = {
  parsed: ParsedInstallCommand;
  results: SkillPreviewResult[];
  installOutput: string;
};

export type SkillPreviewAttestation = {
  version: typeof skillPreviewTokenVersion;
  workspaceId: string;
  userId: string;
  commandHash: string;
  contentChecksum: string;
  expiresAt: number;
};

export class SkillPreviewConflictError extends Error {
  readonly code = "SKILL_PREVIEW_STALE";

  constructor(
    message = "Skill source changed since preview. Review it again before installing.",
  ) {
    super(message);
    this.name = "SkillPreviewConflictError";
  }
}

export function canManageSkill(
  skill: AgentSkillRow,
  userId: string,
  canManageGlobal = false,
) {
  return skill.createdById === userId || (skill.isGlobal && canManageGlobal);
}

export async function canViewSkill(
  skill: Pick<AgentSkillRow, "id" | "createdById" | "isGlobal">,
  userId: string,
) {
  return (
    skill.createdById === userId ||
    skill.isGlobal ||
    authorization.hasDirectPermission(
      { principalType: "user", principalId: userId },
      "tools.view",
      "skill",
      skill.id,
    )
  );
}

export async function assertCanManageSkill(
  skill: AgentSkillRow,
  userId: string,
  canManageGlobal = false,
) {
  if (
    !canManageSkill(skill, userId, canManageGlobal) &&
    !(await authorization.hasDirectPermission(
      { principalType: "user", principalId: userId },
      "tools.configure",
      "skill",
      skill.id,
    ))
  ) {
    throw new Error("Skill not found");
  }
}

export function stripAnsi(value: string) {
  return value.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, "");
}

export function tokenizeInstallCommand(command: string) {
  const tokens: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;
  let escaping = false;

  for (const char of command.trim()) {
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }
    if (char === "\\") {
      escaping = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = null;
      else current += char;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }
  if (quote) throw new Error("Install command contains an unterminated quote");
  if (current) tokens.push(current);
  return tokens;
}

export function normalizePackageAndSkill(value: string): ParsedInstallCommand {
  const atIndex = value.lastIndexOf("@");
  if (atIndex > value.indexOf("/") && atIndex < value.length - 1) {
    return {
      sourcePackage: value.slice(0, atIndex),
      skillNames: [value.slice(atIndex + 1)],
    };
  }
  return { sourcePackage: value, skillNames: [] };
}

export const SKILLS_CLI_FLAGS = new Set([
  "--copy",
  "-y",
  "--yes",
  "--full-depth",
  "-g",
  "--global",
]);
export const SKILLS_CLI_VALUE_FLAGS = new Set(["--agent", "-a"]);
export const GITHUB_PACKAGE_PATTERN =
  /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?$/;
