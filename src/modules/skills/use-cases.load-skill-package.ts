import { logHandledError } from "@/lib/logger";
import { audit } from "@/server/domain/services/audit";
import { db } from "@/server/infrastructure/db";
import { agentSkills } from "@/server/infrastructure/db/schema";
import { mkdir, mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  parseFrontmatter,
  runSkillsCli,
  verifySkillInstallPreviewToken,
  walkFiles,
} from "./use-cases.create-skill-install-preview-token";
import {
  AgentSkillRow,
  LoadedSkillPackage,
  maxMarkdownFileBytes,
  maxSkillMarkdownBytes,
  SkillMarkdownFile,
  SkillPreviewConflictError,
  SkillPreviewResult,
  stripAnsi,
} from "./use-cases.exec-file-async";
import {
  checksumSkillPreview,
  parseSkillsInstallCommand,
} from "./use-cases.parse-skills-install-command";

async function extractMarkdownFiles(
  skillDir: string,
): Promise<SkillMarkdownFile[]> {
  try {
    const allFiles = await walkFiles(skillDir);
    const markdownFiles: SkillMarkdownFile[] = [];
    let totalBytes = 0;

    for (const file of allFiles) {
      if (!file.toLowerCase().endsWith(".md")) continue;
      const fileStat = await stat(file);
      if (fileStat.size > maxMarkdownFileBytes) continue;
      if (totalBytes + fileStat.size > maxSkillMarkdownBytes) break;
      const content = await readFile(file, "utf8");
      totalBytes += Buffer.byteLength(content);
      markdownFiles.push({
        path: path.relative(skillDir, file).split(path.sep).join("/"),
        content,
      });
    }

    markdownFiles.sort((a, b) => {
      if (a.path === "SKILL.md") return -1;
      if (b.path === "SKILL.md") return 1;
      return a.path.localeCompare(b.path);
    });
    return markdownFiles;
  } catch (error) {
    logHandledError(
      "Failed to extract skill markdown files",
      { skillDir },
      error as Error,
    );
    throw error;
  }
}

export async function loadSkillPackage(
  installCommand: string,
  tempPrefix: string,
): Promise<LoadedSkillPackage> {
  const parsed = parseSkillsInstallCommand(installCommand);
  const tempDir = await mkdtemp(path.join(tmpdir(), tempPrefix));
  const tempHome = path.join(tempDir, "home");
  await mkdir(tempHome, { recursive: true });

  try {
    const args = [
      "--yes",
      "skills",
      "add",
      parsed.sourcePackage,
      "--copy",
      "-y",
      "--agent",
      "claude-code",
    ];
    for (const skillName of parsed.skillNames) {
      args.push("--skill", skillName);
    }

    const { stdout, stderr } = await runSkillsCli(args, tempDir, tempHome);
    const installedRoot = path.join(tempDir, ".claude", "skills");
    const rootEntries = await readdir(installedRoot, {
      withFileTypes: true,
    }).catch(() => []);
    const skillDirs = rootEntries
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(installedRoot, entry.name))
      .sort((a, b) => path.basename(a).localeCompare(path.basename(b)));

    if (skillDirs.length === 0) {
      throw new Error(
        "The install command did not produce any skill directory",
      );
    }

    const results: SkillPreviewResult[] = [];
    for (const skillDir of skillDirs) {
      const markdownFiles = await extractMarkdownFiles(skillDir);
      if (markdownFiles.length === 0) continue;
      const skillFile = markdownFiles.find((file) => file.path === "SKILL.md");
      const frontmatter = skillFile ? parseFrontmatter(skillFile.content) : {};
      const fallbackName = path.basename(skillDir);
      results.push({
        name: frontmatter.name || fallbackName,
        description: frontmatter.description ?? null,
        markdownFiles,
        sourcePackage: parsed.sourcePackage,
      });
    }

    if (results.length === 0) {
      throw new Error("No Markdown files were found in the installed skill");
    }

    return {
      parsed,
      results,
      installOutput: stripAnsi(`${stdout}\n${stderr}`).slice(0, 4_000),
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

export async function installSkillsFromCommand(input: {
  workspaceId: string;
  userId: string;
  installCommand: string;
  previewToken: string;
  isGlobal?: boolean;
}) {
  const preview = verifySkillInstallPreviewToken(input);

  try {
    const loaded = await loadSkillPackage(
      input.installCommand,
      "ai-hub-skills-install-",
    );
    const contentChecksum = checksumSkillPreview(loaded.results);
    if (contentChecksum !== preview.contentChecksum) {
      throw new SkillPreviewConflictError();
    }

    const created = await db.transaction(async (tx) => {
      const rows: AgentSkillRow[] = [];
      for (const skill of loaded.results) {
        const [row] = await tx
          .insert(agentSkills)
          .values({
            workspaceId: input.workspaceId,
            createdById: input.userId,
            isGlobal: input.isGlobal ?? false,
            name: skill.name,
            description: skill.description,
            sourcePackage: loaded.parsed.sourcePackage,
            sourceSkillName: skill.name,
            installCommand: input.installCommand,
            markdownFilesJson: skill.markdownFiles,
            metadataJson: {
              importedMarkdownFiles: skill.markdownFiles.length,
              omittedNonMarkdownFiles: true,
              installOutput: loaded.installOutput,
              previewChecksum: contentChecksum,
            },
          })
          .returning();
        rows.push(row);
      }
      return rows;
    });

    await audit.emit({
      workspaceId: input.workspaceId,
      actorPrincipalType: "user",
      actorPrincipalId: input.userId,
      action: "skill.installed",
      resourceType: "workspace",
      resourceId: input.workspaceId,
      outcome: "success",
      metadata: {
        sourcePackage: loaded.parsed.sourcePackage,
        skillNames: loaded.parsed.skillNames,
        installedSkillIds: created.map((skill) => skill.id),
        onlyMarkdownImported: true,
        previewChecksum: contentChecksum,
      },
    });

    return created;
  } catch (error) {
    const parsed = parseSkillsInstallCommand(input.installCommand);
    logHandledError(
      "Failed to install skills from command",
      { sourcePackage: parsed.sourcePackage },
      error as Error,
    );
    throw error;
  }
}
