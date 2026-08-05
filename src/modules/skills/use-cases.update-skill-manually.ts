import { audit } from "@/server/domain/services/audit";
import { db } from "@/server/infrastructure/db";
import {
agentSkillBindings,
agentSkills,
} from "@/server/infrastructure/db/schema";
import { and,eq,isNull,sql } from "drizzle-orm";
import {
AgentSkillRow,
assertCanManageSkill,
maxSkillMarkdownBytes,
skillDescriptionMaxLength,
SkillMarkdownFile,
skillNamePattern,
} from "./use-cases.exec-file-async";

export async function updateSkillManually(input: {
  workspaceId: string;
  userId: string;
  skillId: string;
  name: string;
  description: string | null;
  markdownFiles: { path: string; content: string }[];
  isGlobal?: boolean;
  canManageGlobal?: boolean;
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

  const [existing] = await db
    .select()
    .from(agentSkills)
    .where(
      and(
        eq(agentSkills.id, input.skillId),
        eq(agentSkills.workspaceId, input.workspaceId),
        isNull(agentSkills.archivedAt),
      ),
    )
    .limit(1);
  if (!existing) throw new Error("Skill not found");
  await assertCanManageSkill(existing, input.userId, input.canManageGlobal);
  if (input.isGlobal && !input.canManageGlobal) {
    throw new Error("Only admins can make skills global");
  }

  const updates: Partial<typeof agentSkills.$inferInsert> = {
    name: input.name.trim(),
    description: input.description?.trim() || null,
    markdownFilesJson: normalizedFiles,
    metadataJson: {
      ...(input.markdownFiles.length > 0 ? { lastEditedManually: true } : {}),
      importedMarkdownFiles: normalizedFiles.length,
    },
    updatedAt: new Date(),
  };
  if (input.isGlobal !== undefined) updates.isGlobal = input.isGlobal;

  const [row] = await db
    .update(agentSkills)
    .set(updates)
    .where(eq(agentSkills.id, input.skillId))
    .returning();

  if (!row) throw new Error("Skill not found");

  await audit.emit({
    workspaceId: input.workspaceId,
    actorPrincipalType: "user",
    actorPrincipalId: input.userId,
    action: "skill.updated",
    resourceType: "workspace",
    resourceId: input.workspaceId,
    outcome: "success",
    metadata: { skillId: input.skillId },
  });

  return row;
}

export function assertSkillMetadata(name: string, description: string | null) {
  const trimmedName = name.trim();
  if (!skillNamePattern.test(trimmedName)) {
    throw new Error(
      "Skill name must be 1-64 chars and contain only lowercase letters, numbers, and hyphens",
    );
  }
  if (/anthropic|claude/.test(trimmedName)) {
    throw new Error("Skill name cannot contain reserved words");
  }
  if (!description?.trim()) {
    throw new Error("Skill description is required");
  }
  if (description.trim().length > skillDescriptionMaxLength) {
    throw new Error("Skill description must be 1024 characters or less");
  }
  if (/[<>]/.test(trimmedName) || /<[^>]+>/.test(description)) {
    throw new Error("Skill metadata cannot contain XML or HTML tags");
  }
}

export function normalizeSkillMarkdownFiles(input: {
  name: string;
  description: string | null;
  files: { path: string; content: string }[];
}): SkillMarkdownFile[] {
  const normalized: SkillMarkdownFile[] = input.files
    .map((file) => ({
      path: file.path.replace(/\\/g, "/").replace(/^\//, ""),
      content: file.content,
    }))
    .filter((file) => file.path.toLowerCase().endsWith(".md"));

  if (!normalized.some((file) => file.path === "SKILL.md")) {
    normalized.unshift({ path: "SKILL.md", content: "" });
  }

  const skillFileIndex = normalized.findIndex(
    (file) => file.path === "SKILL.md",
  );
  const skillFile = normalized[skillFileIndex];
  const body = skillFile.content
    .replace(/^---\n[\s\S]*?\n---\n?/, "")
    .trimStart();
  const description = input.description?.trim() ?? "";
  normalized[skillFileIndex] = {
    path: "SKILL.md",
    content:
      `---\nname: ${input.name.trim()}\ndescription: ${description}\n---\n\n${body}`.trimEnd(),
  };

  normalized.sort((a, b) => {
    if (a.path === "SKILL.md") return -1;
    if (b.path === "SKILL.md") return 1;
    return a.path.localeCompare(b.path);
  });

  const totalBytes = normalized.reduce(
    (sum, file) => sum + Buffer.byteLength(file.content),
    0,
  );
  if (totalBytes > maxSkillMarkdownBytes) {
    throw new Error("Total Markdown content exceeds size limit");
  }
  return normalized;
}

export async function getBoundSkillCatalog(
  agentVersionId: string,
  disabledSkillIds: ReadonlySet<string> = new Set(),
) {
  const skills = await db
    .select({
      id: agentSkills.id,
      name: agentSkills.name,
      description: agentSkills.description,
    })
    .from(agentSkillBindings)
    .innerJoin(agentSkills, eq(agentSkillBindings.skillId, agentSkills.id))
    .where(
      and(
        eq(agentSkillBindings.agentVersionId, agentVersionId),
        isNull(agentSkills.archivedAt),
      ),
    )
    .orderBy(sql`${agentSkills.name} ASC`);
  return skills.filter((skill) => !disabledSkillIds.has(skill.id));
}

export async function buildSkillsRegistryPrompt(
  agentVersionId: string,
  disabledSkillIds: ReadonlySet<string> = new Set(),
) {
  const skills = await getBoundSkillCatalog(agentVersionId, disabledSkillIds);
  if (skills.length === 0) return null;

  const skillList = skills
    .map(
      (skill) =>
        `- ${skill.name}: ${skill.description ?? "No description provided"}`,
    )
    .join("\n");

  return [
    "Agent skills are available via progressive disclosure. Only skill names and descriptions are listed here; full skill instructions are not in this prompt.",
    "When a skill is relevant to the user's request, call the load_skill tool with the exact skill name before applying it.",
    "Do not assume a skill's detailed workflow until load_skill returns its Markdown instructions.",
    "Available skills:",
    skillList,
  ].join("\n");
}
