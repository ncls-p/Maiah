import { env } from "@/lib/env";
import { createHash,createHmac } from "node:crypto";
import {
GITHUB_PACKAGE_PATTERN,
ParsedInstallCommand,
SKILLS_CLI_FLAGS,
SKILLS_CLI_VALUE_FLAGS,
SkillPreviewResult,
maxInstallCommandLength,
normalizePackageAndSkill,
tokenizeInstallCommand,
} from "./use-cases.exec-file-async";

const SKILL_NAME_PATTERN = /^[A-Za-z0-9_.-]+$/;

function assertValidInstallCommand(command: string) {
  if (!command.trim()) throw new Error("Install command is required");
  if (command.length > maxInstallCommandLength) {
    throw new Error("Install command is too long");
  }
}

function readSkillsCliPrefix(tokens: string[]) {
  let index = tokens[0] === "npx" ? 1 : 0;

  while (["--yes", "-y"].includes(tokens[index])) index += 1;

  if (tokens[index] === "skillsadd") {
    throw new Error(
      "Use `npx skills add ...` with a space between skills and add",
    );
  }
  if (tokens[index] !== "skills") {
    throw new Error("Only `npx skills add ...` commands are supported");
  }

  return index + 1;
}

function readPackageToken(tokens: string[], index: number) {
  if (!tokens[index] || !["add", "a"].includes(tokens[index])) {
    throw new Error("Only `skills add` install commands are supported");
  }

  const packageToken = tokens[index + 1];
  if (!packageToken || packageToken.startsWith("-")) {
    throw new Error("Install command must include a skill package");
  }

  return { packageToken, nextIndex: index + 2 };
}

function collectSkillNames(tokens: string[], index: number, initial: string[]) {
  const skillNames = new Set(initial);

  while (index < tokens.length) {
    const token = tokens[index];

    if (token === "--skill" || token === "-s") {
      const skillName = tokens[index + 1];
      if (!skillName || skillName.startsWith("-")) {
        throw new Error("Missing skill name after --skill");
      }
      skillNames.add(skillName);
      index += 2;
      continue;
    }

    if (SKILLS_CLI_FLAGS.has(token)) {
      index += 1;
      continue;
    }
    if (SKILLS_CLI_VALUE_FLAGS.has(token)) {
      index += 2;
      continue;
    }

    throw new Error(`Unsupported install option: ${token}`);
  }

  return skillNames;
}

function normalizeSkillNames(skillNames: Set<string>) {
  const normalizedSkills = [...skillNames]
    .map((name) => name.trim())
    .filter(Boolean);

  if (normalizedSkills.length === 0) {
    throw new Error(
      "Choose a specific skill with `--skill <name>` or `owner/repo@skill`",
    );
  }

  for (const skillName of normalizedSkills) {
    if (!SKILL_NAME_PATTERN.test(skillName) || skillName === "*") {
      throw new Error(
        "Skill names must be explicit and contain only letters, numbers, dot, dash or underscore",
      );
    }
  }

  return normalizedSkills;
}

function normalizeSourcePackage(sourcePackage: string) {
  const normalized = sourcePackage.replace(/^https:\/\/github.com\//, "");
  if (!GITHUB_PACKAGE_PATTERN.test(normalized)) {
    throw new Error(
      "Only GitHub owner/repository skill packages are supported",
    );
  }
  return normalized;
}

export function parseSkillsInstallCommand(
  command: string,
): ParsedInstallCommand {
  assertValidInstallCommand(command);

  const tokens = tokenizeInstallCommand(command.replace(/^\$\s*/, ""));
  const prefixEnd = readSkillsCliPrefix(tokens);
  const { packageToken, nextIndex } = readPackageToken(tokens, prefixEnd);
  const parsed = normalizePackageAndSkill(packageToken);
  const skillNames = collectSkillNames(tokens, nextIndex, parsed.skillNames);

  return {
    sourcePackage: normalizeSourcePackage(parsed.sourcePackage),
    skillNames: normalizeSkillNames(skillNames),
  };
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function installCommandHash(command: string) {
  const parsed = parseSkillsInstallCommand(command);
  return sha256(
    JSON.stringify({
      sourcePackage: parsed.sourcePackage,
      skillNames: [...parsed.skillNames].sort(),
    }),
  );
}

export function checksumSkillPreview(skills: SkillPreviewResult[]) {
  const canonical = [...skills]
    .map((skill) => ({
      name: skill.name,
      description: skill.description,
      sourcePackage: skill.sourcePackage,
      markdownFiles: [...skill.markdownFiles]
        .sort((a, b) => a.path.localeCompare(b.path))
        .map((file) => ({
          path: file.path,
          contentHash: sha256(file.content),
        })),
    }))
    .sort((a, b) =>
      `${a.sourcePackage}/${a.name}`.localeCompare(
        `${b.sourcePackage}/${b.name}`,
      ),
    );
  return sha256(JSON.stringify(canonical));
}

export function signSkillPreviewPayload(payload: string) {
  return createHmac("sha256", Buffer.from(env.APP_ENCRYPTION_KEY, "hex"))
    .update(payload)
    .digest("base64url");
}
