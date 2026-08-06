import { db } from "@/server/infrastructure/db";
import { agentSkillBindings,agentSkills } from "@/server/infrastructure/db/schema";
import { and,eq,isNull } from "drizzle-orm";
import { toMarkdownFiles } from "./use-cases.clone-skill-bindings";
import { maxPromptBytes } from "./use-cases.exec-file-async";

export async function loadBoundSkillContent(input: { agentVersionId: string; skillName: string; disabledSkillIds?: ReadonlySet<string> }) {
  const rows = await db
    .select({ skill: agentSkills })
    .from(agentSkillBindings)
    .innerJoin(agentSkills, eq(agentSkillBindings.skillId, agentSkills.id))
    .where(and(eq(agentSkillBindings.agentVersionId, input.agentVersionId), isNull(agentSkills.archivedAt)));

  const normalizedName = input.skillName.trim().toLowerCase();
  const row = rows.find((item) => item.skill.name.toLowerCase() === normalizedName && !input.disabledSkillIds?.has(item.skill.id));
  if (!row) {
    return {
      found: false,
      message: "Skill not found or not enabled for this agent version. Use one of the names listed in the skills registry.",
    };
  }

  const files = toMarkdownFiles(row.skill.markdownFilesJson);
  let content = `# Skill: ${row.skill.name}\n\n${row.skill.description ?? ""}\n`;
  for (const file of files) {
    const block = `\n\n## File: ${file.path}\n\n${file.content.trim()}\n`;
    if (Buffer.byteLength(content + block) > maxPromptBytes) break;
    content += block;
  }

  return {
    found: true,
    name: row.skill.name,
    description: row.skill.description,
    content: content.trim(),
  };
}
