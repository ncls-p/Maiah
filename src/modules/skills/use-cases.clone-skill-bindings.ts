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
import { BindingDb } from "./use-cases.list-agent-skills";
import {
  AgentSkillRow,
  SkillMarkdownFile,
  SkillPreviewResult,
  canViewSkill,
} from "./use-cases.exec-file-async";
import { parseSkillsInstallCommand } from "./use-cases.parse-skills-install-command";
import { loadSkillPackage } from "./use-cases.load-skill-package";
import {
  assertSkillMetadata,
  normalizeSkillMarkdownFiles,
} from "./use-cases.update-skill-manually";

export async function cloneSkillBindings(
  fromAgentVersionId: string | null,
  toAgentVersionId: string,
  workspaceId?: string,
  options?: { userId?: string },
  executor: BindingDb = db,
) {
  if (!fromAgentVersionId) return;
  const existing = await executor
    .select({
      skillId: agentSkillBindings.skillId,
      id: agentSkills.id,
      createdById: agentSkills.createdById,
      isGlobal: agentSkills.isGlobal,
    })
    .from(agentSkillBindings)
    .innerJoin(agentSkills, eq(agentSkillBindings.skillId, agentSkills.id))
    .where(
      workspaceId && options?.userId
        ? and(
            eq(agentSkillBindings.agentVersionId, fromAgentVersionId),
            eq(agentSkills.workspaceId, workspaceId),
            isNull(agentSkills.archivedAt),
          )
        : eq(agentSkillBindings.agentVersionId, fromAgentVersionId),
    );

  const visibleBindings =
    workspaceId && options?.userId
      ? (
          await Promise.all(
            existing.map(async (binding) =>
              (await canViewSkill(binding, options.userId!)) ? binding : null,
            ),
          )
        ).filter((binding) => binding !== null)
      : existing;
  if (visibleBindings.length === 0) return;

  await executor.insert(agentSkillBindings).values(
    visibleBindings.map((row) => ({
      agentVersionId: toAgentVersionId,
      skillId: row.skillId,
    })),
  );
}

function isSkillMarkdownFile(
  file: unknown,
): file is { path: string; content: string } {
  return (
    typeof file === "object" &&
    file !== null &&
    "path" in file &&
    "content" in file &&
    typeof file.path === "string" &&
    typeof file.content === "string" &&
    file.path.toLowerCase().endsWith(".md")
  );
}

export function toMarkdownFiles(value: unknown): SkillMarkdownFile[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((file) =>
    isSkillMarkdownFile(file)
      ? [{ path: file.path, content: file.content }]
      : [],
  );
}

export async function previewSkillInstall(
  installCommand: string,
): Promise<SkillPreviewResult[]> {
  const parsed = parseSkillsInstallCommand(installCommand);

  try {
    return (await loadSkillPackage(installCommand, "ai-hub-skills-preview-"))
      .results;
  } catch (error) {
    logHandledError(
      "Failed to preview skill install",
      { sourcePackage: parsed.sourcePackage },
      error as Error,
    );
    throw error;
  }
}

export async function createSkillManually(input: {
  workspaceId: string;
  userId: string;
  name: string;
  description: string | null;
  markdownFiles: { path: string; content: string }[];
  isGlobal?: boolean;
}): Promise<AgentSkillRow> {
  if (input.markdownFiles.length === 0) {
    throw new Error("At least one Markdown file is required");
  }
  assertSkillMetadata(input.name, input.description);

  const normalizedFiles = normalizeSkillMarkdownFiles({
    name: input.name,
    description: input.description,
    files: input.markdownFiles,
  });
  if (normalizedFiles.length === 0) {
    throw new Error("All files must be .md files");
  }

  const [row] = await db
    .insert(agentSkills)
    .values({
      workspaceId: input.workspaceId,
      createdById: input.userId,
      isGlobal: input.isGlobal ?? false,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      sourcePackage: null,
      sourceSkillName: input.name.trim(),
      installCommand: null,
      markdownFilesJson: normalizedFiles,
      metadataJson: {
        createdManually: true,
        importedMarkdownFiles: normalizedFiles.length,
      },
    })
    .returning();

  await audit.emit({
    workspaceId: input.workspaceId,
    actorPrincipalType: "user",
    actorPrincipalId: input.userId,
    action: "skill.created",
    resourceType: "workspace",
    resourceId: input.workspaceId,
    outcome: "success",
    metadata: {
      skillId: row.id,
      createdManually: true,
    },
  });

  return row;
}
